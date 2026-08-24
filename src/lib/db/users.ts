/**
 * Repositorio de usuarios internos.
 *
 * No hay alta pública ni pantalla de administración en esta etapa: las cuentas
 * se siembran (ver seed.ts) y en Fase 2 las crea el despacho en la base. Lo que
 * el portal necesita hoy es únicamente autenticar y saber si la cuenta sigue
 * activa. Ver docs/DECISIONES_PENDIENTES.md, punto 4.
 */
import { clone, getStore } from '@/lib/db/store'
import { nowIso } from '@/lib/dates'
import type { PublicStaffUser, StaffUser } from '@/lib/domain/types'

export function toPublicUser(user: StaffUser): PublicStaffUser {
  const { passwordHash: _passwordHash, ...rest } = clone(user)
  return rest
}

export async function findUserById(id: string): Promise<StaffUser | null> {
  const user = getStore().users.find((u) => u.id === id)
  return user ? clone(user) : null
}

export async function findUserByEmail(email: string): Promise<StaffUser | null> {
  const needle = email.trim().toLowerCase()
  const user = getStore().users.find((u) => u.email.toLowerCase() === needle)
  return user ? clone(user) : null
}

export async function touchLastLogin(id: string): Promise<void> {
  const user = getStore().users.find((u) => u.id === id)
  if (user) user.lastLoginAt = nowIso()
}
