/**
 * Ventana deslizante EN LA BASE.
 *
 * Protege dos cosas distintas con el mismo mecanismo: el acceso al portal
 * (fuerza bruta contra contraseñas) y el formulario público (spam y bots).
 *
 * POR QUÉ NO EN MEMORIA. Lo estuvo hasta el 2026-08-31, y en serverless eso no
 * es un límite: cada instancia contaba por separado, así que el número que
 * anunciaba la pantalla había que multiplicarlo por cuantas instancias quisiera
 * levantar quien atacara —y atacar es precisamente lo que hace que Vercel
 * levante más—. La cuenta tiene que ser una sola, y el único sitio que todas
 * las instancias comparten es Postgres.
 *
 * SE FALLA HACIA EL LADO QUE DEJA PASAR. Si la consulta revienta, se permite el
 * intento en vez de bloquearlo. No es indulgencia: sin base no hay portal —el
 * acceso no puede leer al usuario ni el formulario guardar la solicitud—, así
 * que negar aquí no protegería nada y solo cambiaría un error claro por una
 * pantalla que dice "demasiados intentos" a quien no ha intentado nada.
 */
import { db } from '@/lib/db/sql'

export interface RateLimitPolicy {
  /** Intentos permitidos dentro de la ventana. */
  limit: number
  windowMs: number
}

/** Acceso al portal: 8 intentos por correo+IP en 10 minutos. */
export const LOGIN_POLICY: RateLimitPolicy = {
  limit: 8,
  windowMs: 10 * 60 * 1000,
}

/**
 * Formulario público: 5 envíos por IP en una hora.
 *
 * Generoso a propósito. Detrás de una misma IP puede haber un cibercafé o el
 * NAT de una operadora móvil, y este formulario es la puerta de entrada de
 * alguien que acaba de perder su trabajo: equivocarse cerrando de más es peor
 * que dejar pasar un envío repetido.
 */
export const LEAD_POLICY: RateLimitPolicy = {
  limit: 5,
  windowMs: 60 * 60 * 1000,
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

const PERMITIDO: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

/**
 * ¿Puede intentarlo?
 *
 * No anota nada: solo mira. Quien llama decide qué cuenta como intento —el
 * acceso solo apunta los FALLIDOS y borra la cuenta al acertar; el formulario
 * apunta todos los envíos— y esa diferencia es deliberada: una contraseña
 * correcta no debe acercarte al bloqueo.
 */
export async function checkRate(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const segundos = policy.windowMs / 1000
  try {
    const [fila] = await db()`
      SELECT count(*)::int AS intentos, min(hit_at) AS mas_viejo
        FROM rate_limit_hits
       WHERE bucket = ${key}
         AND hit_at > now() - make_interval(secs => ${segundos})
    `
    const intentos: number = fila?.intentos ?? 0
    if (intentos < policy.limit) return PERMITIDO

    // Se libera cuando el intento MÁS VIEJO sale de la ventana, no cuando pasa
    // la ventana entera desde ahora: es una ventana deslizante, y decir de más
    // haría que la gente esperara sin necesidad.
    const masViejo = fila?.mas_viejo ? new Date(fila.mas_viejo).getTime() : Date.now()
    const restante = policy.windowMs - (Date.now() - masViejo)
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(restante / 1000)) }
  } catch {
    return PERMITIDO
  }
}

/** Apunta un intento. */
export async function registerHit(key: string): Promise<void> {
  try {
    await db()`INSERT INTO rate_limit_hits (bucket) VALUES (${key})`
  } catch {
    // No anotar un intento nunca debe tumbar la operación que lo provocó.
  }
}

/** Borra la cuenta de una clave. El acceso la llama al acertar la contraseña. */
export async function clearRate(key: string): Promise<void> {
  try {
    await db()`DELETE FROM rate_limit_hits WHERE bucket = ${key}`
  } catch {
    // Ídem: no acertar a limpiar no puede impedir entrar.
  }
}

/**
 * Purga lo que ya no cuenta para ninguna ventana. La llama el mantenimiento
 * diario: sin esto la tabla crece para siempre con filas que nadie consulta.
 *
 * El margen sobre la ventana más larga —una hora— es amplio a propósito: borrar
 * justo en el borde no gana nada y podría recortar una ventana en curso.
 */
export async function purgeRateLimits(olderThanHours = 24): Promise<number> {
  const rows = await db()`
    DELETE FROM rate_limit_hits
     WHERE hit_at < now() - make_interval(hours => ${olderThanHours})
    RETURNING id
  `
  return rows.length
}

/** Solo para tests. */
export async function resetRateLimits(): Promise<void> {
  await db()`TRUNCATE rate_limit_hits`
}
