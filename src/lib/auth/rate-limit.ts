/**
 * Ventana deslizante en memoria.
 *
 * Protege dos cosas distintas con el mismo mecanismo: el acceso al portal
 * (fuerza bruta contra contraseñas) y el formulario público (spam y bots).
 *
 * Limitación de Fase 1: el conteo es por instancia. En serverless cada
 * instancia cuenta por separado, así que el límite efectivo es más flojo de lo
 * que dice el número. En Fase 2 pasa a la base o a un almacén compartido.
 */
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

interface Bucket {
  attempts: number[]
}

const globalRef = globalThis as unknown as {
  __slRateLimit?: Map<string, Bucket>
}

function buckets(): Map<string, Bucket> {
  if (!globalRef.__slRateLimit) globalRef.__slRateLimit = new Map()
  return globalRef.__slRateLimit
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkRate(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now()
  const bucket = buckets().get(key) ?? { attempts: [] }
  bucket.attempts = bucket.attempts.filter((t) => now - t < policy.windowMs)
  buckets().set(key, bucket)

  if (bucket.attempts.length >= policy.limit) {
    const oldest = bucket.attempts[0]
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((policy.windowMs - (now - oldest)) / 1000),
    }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

export function registerHit(key: string): void {
  const bucket = buckets().get(key) ?? { attempts: [] }
  bucket.attempts.push(Date.now())
  buckets().set(key, bucket)
}

export function clearRate(key: string): void {
  buckets().delete(key)
}

/** Solo para tests. */
export function resetRateLimits(): void {
  globalRef.__slRateLimit = new Map()
}
