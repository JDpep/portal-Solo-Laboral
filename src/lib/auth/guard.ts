/**
 * Guarda de servidor del portal interno.
 *
 * TODA página y TODA lectura del portal pasa por aquí. Los datos de los
 * prospectos son personales: nombre, teléfono y el relato de su despido. Nada
 * de eso sale del servidor sin una sesión viva.
 */
import { redirect } from 'next/navigation'
import { ensureSeeded } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import type { PublicStaffUser } from '@/lib/domain/types'

/** Sesión viva o redirección a /acceso. */
export async function requireStaff(): Promise<PublicStaffUser> {
  await ensureSeeded()
  const user = await getCurrentUser()
  if (!user) redirect('/acceso')
  return user
}
