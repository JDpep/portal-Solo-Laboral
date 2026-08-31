'use server'

/**
 * MI CUENTA.
 *
 * Aquí cada quien cambia SU contraseña, y solo la suya. No hay campo de usuario
 * ni de id: el dueño de la sesión es el único sujeto posible de esta acción.
 * Un formulario que aceptara "a quién" sería una puerta para cambiarle la
 * contraseña a otro, y esa capacidad —cuando exista— pertenece a
 * Administración, con un rol que la respalde.
 */
import { revalidatePath } from 'next/cache'
import { currentStaff } from '@/lib/auth/guard'
import { findUserById, setUserPassword } from '@/lib/db/users'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/auth/password'
import { clientIp, setSessionCookie } from '@/lib/auth/session'
import { LOGIN_POLICY, checkRate, clearRate, registerHit } from '@/lib/auth/rate-limit'

export interface PasswordState {
  error?: string
  ok?: string
}

/**
 * CAMBIAR MI CONTRASEÑA.
 *
 * Pide la ACTUAL aunque haya sesión abierta. No es burocracia: la sesión vive
 * doce horas en una cookie, y sin este paso bastaría una pantalla sin bloquear
 * —un portátil abierto en una sala de juntas— para que alguien se quedara con
 * la cuenta. Escribir la actual es lo único que distingue al dueño de quien
 * simplemente alcanzó el teclado.
 *
 * Y se limita igual que el acceso: si no se limitara, este formulario sería un
 * sitio cómodo para adivinar la contraseña actual a fuerza de intentos, con la
 * ventaja de saber ya de quién es la cuenta.
 */
export async function cambiarPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const sesion = await currentStaff()
  if (!sesion) return { error: 'Tu sesión expiró. Vuelve a entrar.' }

  const actual = String(formData.get('actual') ?? '')
  const nueva = String(formData.get('nueva') ?? '')
  const confirmacion = String(formData.get('confirmacion') ?? '')

  if (!actual || !nueva) return { error: 'Escribe tu contraseña actual y la nueva.' }

  const clave = `password|${sesion.id}|${clientIp() ?? 'sin-ip'}`
  const intento = checkRate(clave, LOGIN_POLICY)
  if (!intento.allowed) {
    return {
      error: `Demasiados intentos fallidos. Vuelve a intentar en ${Math.ceil(intento.retryAfterSeconds / 60)} minutos.`,
    }
  }

  // Se relee del repositorio: la sesión no lleva el hash, y no debe llevarlo.
  const usuario = await findUserById(sesion.id)
  if (!usuario || usuario.status !== 'active') return { error: 'Tu sesión expiró. Vuelve a entrar.' }

  if (!(await verifyPassword(actual, usuario.passwordHash))) {
    registerHit(clave)
    return { error: 'Tu contraseña actual no es correcta.' }
  }
  clearRate(clave)

  const flojita = validatePasswordStrength(nueva)
  if (flojita) return { error: flojita }
  if (nueva !== confirmacion) return { error: 'La confirmación no coincide con la contraseña nueva.' }
  if (nueva === actual) return { error: 'La contraseña nueva tiene que ser distinta de la actual.' }

  await setUserPassword(usuario.id, await hashPassword(nueva), usuario.id)

  // La cookie se vuelve a emitir AHORA. `setUserPassword` acaba de sellar la
  // hora del cambio, y a partir de ese sello toda sesión anterior deja de
  // valer: sin esta línea, cambiar la contraseña te echaría a ti también.
  setSessionCookie(usuario.id)

  revalidatePath('/portal/cuenta')
  return { ok: 'Contraseña cambiada. Las demás sesiones abiertas quedaron cerradas.' }
}
