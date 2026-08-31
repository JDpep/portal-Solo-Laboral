/**
 * CONFIGURACIÓN DE LOS AVISOS AL DESPACHO.
 *
 * Todo se lee del entorno y todo es opcional: si falta cualquier pieza, no se
 * avisa y no pasa nada más. Esa es la postura entera de este módulo —un aviso
 * que no sale JAMÁS puede impedir que se guarde una solicitud—, porque el
 * formulario es la puerta de entrada de alguien que acaba de perder su trabajo
 * y perder su caso por un problema de correo sería el peor fallo posible.
 */

/** Clave de Resend. Sin ella no se envía nada. */
export function resendApiKey(): string | null {
  const raw = process.env.RESEND_API_KEY?.trim()
  return raw ? raw : null
}

/**
 * Remitente. Tiene que ser un dominio verificado en Resend; si no lo es, la API
 * rechaza el envío. Formato "Nombre <buzon@dominio>" o solo el buzón.
 */
export function mailFrom(): string | null {
  const raw = process.env.MAIL_FROM?.trim()
  return raw ? raw : null
}

/**
 * A quién se avisa. Varias direcciones separadas por coma.
 *
 * Es una lista y no una sola dirección a propósito: el valor de este aviso es
 * que alguien lo lea EN MINUTOS, y una sola dirección hace que todo dependa de
 * que esa persona no esté en una audiencia.
 */
export function alertRecipients(): string[] {
  const raw = process.env.ALERTA_DESTINOS ?? ''
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.includes('@'))
}

/** Se avisa solo si están las tres piezas. */
export function alertsEnabled(): boolean {
  return resendApiKey() !== null && mailFrom() !== null && alertRecipients().length > 0
}

/**
 * De dónde cuelgan los enlaces del correo.
 *
 * `SITE_URL` manda; si no está, se usa el dominio que Vercel inyecta en cada
 * despliegue. Ese respaldo apunta al despliegue concreto y no al dominio
 * estable, así que sirve para que el enlace funcione, no para publicarlo.
 */
export function siteUrl(): string {
  const explicito = process.env.SITE_URL?.trim().replace(/\/$/, '')
  if (explicito) return explicito
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  return vercel ? `https://${vercel}` : ''
}
