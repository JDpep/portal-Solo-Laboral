/**
 * Sesión del portal interno.
 *
 * Cookie httpOnly firmada con HMAC-SHA256. La cookie guarda SOLO el id de
 * usuario y la fecha de emisión: el estado de la cuenta se relee del
 * repositorio en cada petición, para que una baja surta efecto de inmediato
 * sobre las sesiones ya abiertas y no haya que esperar a que expire la cookie.
 */
import { cookies, headers } from 'next/headers'
import { sign, safeEqual } from '@/lib/auth/signing'
import { findUserById, toPublicUser } from '@/lib/db/users'
import type { PublicStaffUser } from '@/lib/domain/types'

const COOKIE_NAME = 'sl_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 h

export interface SessionToken {
  userId: string
  issuedAt: number
}

export function encodeSession(token: SessionToken): string {
  const payload = Buffer.from(JSON.stringify(token)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function decodeSession(raw: string | undefined): SessionToken | null {
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null
  if (!safeEqual(signature, sign(payload))) return null
  try {
    const token = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionToken
    if (typeof token.userId !== 'string' || typeof token.issuedAt !== 'number') return null
    if (Date.now() - token.issuedAt > SESSION_TTL_MS) return null
    return token
  } catch {
    return null
  }
}

export function setSessionCookie(userId: string): void {
  cookies().set(COOKIE_NAME, encodeSession({ userId, issuedAt: Date.now() }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
}

/** Usuario autenticado, o null. Una cuenta inactiva NO tiene sesión válida. */
export async function getCurrentUser(): Promise<PublicStaffUser | null> {
  const token = decodeSession(cookies().get(COOKIE_NAME)?.value)
  if (!token) return null
  const user = await findUserById(token.userId)
  if (!user || user.status !== 'active') return null
  return toPublicUser(user)
}

/** IP del cliente, para los límites de intentos. */
export function clientIp(): string | null {
  const h = headers()
  const forwarded = h.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip')
}
