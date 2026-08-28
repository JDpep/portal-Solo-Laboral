/**
 * Guarda de servidor del portal interno.
 *
 * TODA página y TODA acción del portal pasa por aquí. Los datos de los
 * prospectos son personales: nombre, teléfono y el relato de su despido. Nada
 * de eso sale del servidor sin una sesión viva.
 *
 * El permiso se comprueba EN EL SERVIDOR, siempre. Esconder un botón no es un
 * permiso: quien escriba la URL a mano tiene que chocar contra esta misma
 * pared, y por eso `requireAdmin` vive aquí y no en un componente.
 */
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import type { PublicStaffUser } from '@/lib/domain/types'

/** Sesión viva o redirección a /acceso. */
export async function requireStaff(): Promise<PublicStaffUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/acceso')
  return user
}

/**
 * Además de sesión, rol de administrador.
 *
 * Redirige a /portal en vez de a /acceso: quien llega aquí SÍ tiene sesión, y
 * mandarlo a iniciarla otra vez le haría creer que su cuenta falló.
 */
export async function requireAdmin(): Promise<PublicStaffUser> {
  const user = await requireStaff()
  if (user.role !== 'admin') redirect('/portal')
  return user
}

/**
 * Para server actions: devuelve el usuario o null, sin redirigir.
 *
 * Una acción que redirige desde dentro deja al formulario sin respuesta que
 * mostrar; aquí se quiere devolver un error legible.
 */
export async function currentStaff(): Promise<PublicStaffUser | null> {
  return getCurrentUser()
}
