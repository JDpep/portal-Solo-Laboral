'use server'

import { redirect } from 'next/navigation'
import { findUserByEmail, touchLastLogin } from '@/lib/db/users'
import { verifyPassword } from '@/lib/auth/password'
import { clearSessionCookie, clientIp, setSessionCookie } from '@/lib/auth/session'
import { LOGIN_POLICY, checkRate, clearRate, registerHit } from '@/lib/auth/rate-limit'

export interface LoginState {
  error?: string
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' }

  const rateKey = `login|${email.toLowerCase()}|${clientIp() ?? 'sin-ip'}`
  const rate = checkRate(rateKey, LOGIN_POLICY)
  if (!rate.allowed) {
    return {
      error: `Demasiados intentos fallidos. Vuelve a intentar en ${Math.ceil(rate.retryAfterSeconds / 60)} minutos.`,
    }
  }

  const user = await findUserByEmail(email)
  // Se verifica siempre, incluso sin usuario: si solo se verificara cuando
  // existe, el tiempo de respuesta revelaría qué correos están dados de alta.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null)

  if (!user || user.status !== 'active' || !passwordOk) {
    registerHit(rateKey)
    // Mensaje único: no revela si el correo existe ni si la cuenta está inactiva.
    return {
      error: 'Correo o contraseña incorrectos, o la cuenta no está activa.',
    }
  }

  clearRate(rateKey)
  await touchLastLogin(user.id)
  setSessionCookie(user.id)
  redirect('/portal')
}

export async function logoutAction(): Promise<void> {
  clearSessionCookie()
  redirect('/acceso')
}
