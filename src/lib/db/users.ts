/**
 * Repositorio de usuarios internos.
 *
 * No hay alta pública: las cuentas las crea un administrador. Tampoco hay
 * borrado — una cuenta se desactiva. Borrarla se llevaría consigo la autoría
 * de todo lo que esa persona hizo, y la bitácora dejaría de poder reconstruir
 * qué pasó con un caso.
 */
import { db, iso, isoRequired , type Row } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import type { PublicStaffUser, StaffRole, StaffUser } from '@/lib/domain/types'

function rowToUser(row: Row): StaffUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: isoRequired(row.created_at),
    lastLoginAt: iso(row.last_login_at),
    passwordHash: row.password_hash ?? null,
  }
}

export function toPublicUser(user: StaffUser): PublicStaffUser {
  const { passwordHash: _passwordHash, ...rest } = user
  return rest
}

export async function findUserById(id: string): Promise<StaffUser | null> {
  if (!isUuid(id)) return null
  const rows = await db()`SELECT * FROM staff_users WHERE id = ${id}::uuid`
  return rows.length ? rowToUser(rows[0]) : null
}

/** `citext` hace la comparación insensible a mayúsculas en la propia base. */
export async function findUserByEmail(email: string): Promise<StaffUser | null> {
  const rows = await db()`SELECT * FROM staff_users WHERE email = ${email.trim()}`
  return rows.length ? rowToUser(rows[0]) : null
}

export async function touchLastLogin(id: string): Promise<void> {
  if (!isUuid(id)) return
  await db()`UPDATE staff_users SET last_login_at = now() WHERE id = ${id}::uuid`
}

/** Cuentas activas: las que pueden ser responsables de un caso o un evento. */
export async function listActiveUsers(): Promise<PublicStaffUser[]> {
  const rows = await db()`
    SELECT * FROM staff_users WHERE status = 'active' ORDER BY name
  `
  return rows.map((row) => toPublicUser(rowToUser(row)))
}

export async function listAllUsers(): Promise<PublicStaffUser[]> {
  const rows = await db()`
    SELECT * FROM staff_users ORDER BY status, name
  `
  return rows.map((row) => toPublicUser(rowToUser(row)))
}

export interface CreateUserInput {
  name: string
  email: string
  role: StaffRole
  passwordHash: string
}

export async function createUser(input: CreateUserInput): Promise<PublicStaffUser> {
  const rows = await db()`
    INSERT INTO staff_users (name, email, role, password_hash)
    VALUES (${input.name}, ${input.email}, ${input.role}::staff_role, ${input.passwordHash})
    RETURNING *
  `
  return toPublicUser(rowToUser(rows[0]))
}

/** Alta o baja. La sesión relee el estado en cada petición, así que una baja
 *  surte efecto de inmediato sobre las sesiones ya abiertas. */
export async function setUserStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<PublicStaffUser | null> {
  if (!isUuid(id)) return null
  const rows = await db()`
    UPDATE staff_users SET status = ${status} WHERE id = ${id}::uuid RETURNING *
  `
  return rows.length ? toPublicUser(rowToUser(rows[0])) : null
}
