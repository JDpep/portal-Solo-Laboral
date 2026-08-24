/**
 * Firma HMAC compartida.
 *
 * Vive aparte de `session.ts` porque ya son dos las cosas que hay que firmar y
 * que no tienen nada que ver entre sí: la sesión del despacho y el permiso
 * temporal que se le da a quien acaba de enviar el formulario para agendar su
 * llamada. Las dos usan el mismo secreto; ninguna debe conocer a la otra.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function secret(): string {
  const value = process.env.SESSION_SECRET
  if (value && value.length >= 16) return value
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET no está configurado. El portal no arranca en producción sin él.',
    )
  }
  // Solo desarrollo: permite levantar el proyecto sin configurar nada.
  return 'desarrollo-inseguro-solo-laboral'
}

export function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** `payload.firma` en base64url, para meter en una cookie. */
export function encodeSigned(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** Devuelve el objeto solo si la firma cuadra. No valida su forma. */
export function decodeSigned<T>(raw: string | undefined): T | null {
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null
  if (!safeEqual(signature, sign(payload))) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
