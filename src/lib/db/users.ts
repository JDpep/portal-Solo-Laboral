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
import { recordAudit } from '@/lib/db/audit'
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

/** El correo ya existe. `citext` hace la comparación insensible a mayúsculas. */
export async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const rows = await db()`
    SELECT 1 FROM staff_users
    WHERE email = ${email.trim()}
      ${exceptId && isUuid(exceptId) ? db()`AND id <> ${exceptId}::uuid` : db()``}
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * Cuántos administradores activos hay.
 *
 * La pantalla de cuentas lo consulta antes de dejar quitar un rol o dar una
 * baja: quedarse sin ningún administrador deja al despacho fuera de su propio
 * portal, y volver a entrar exigiría abrir la terminal, que es exactamente lo
 * que esta pantalla viene a evitar.
 */
export async function countActiveAdmins(): Promise<number> {
  const rows = await db()`
    SELECT count(*)::int AS total FROM staff_users WHERE role = 'admin' AND status = 'active'
  `
  return rows[0].total as number
}

export interface UpdateUserInput {
  name?: string
  email?: string
  role?: StaffRole
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<PublicStaffUser | null> {
  if (!isUuid(id)) return null
  const sql = db()
  const before = await sql`SELECT * FROM staff_users WHERE id = ${id}::uuid`
  if (!before.length) return null
  const previous = rowToUser(before[0])

  const rows = await sql`
    UPDATE staff_users SET
      name = ${input.name ?? previous.name},
      email = ${input.email ?? previous.email},
      role = ${input.role ?? previous.role}::staff_role
    WHERE id = ${id}::uuid
    RETURNING *
  `
  await recordAudit({
    userId: actorId,
    action: 'user_update',
    entity: 'user',
    entityId: id,
    before: { name: previous.name, email: previous.email, role: previous.role },
    after: { name: rows[0].name, email: rows[0].email, role: rows[0].role },
  })
  return toPublicUser(rowToUser(rows[0]))
}

/**
 * Poner una contraseña nueva.
 *
 * La contraseña en claro NUNCA llega hasta aquí: se recibe ya convertida en
 * hash. Y la bitácora anota QUE se cambió, jamás a qué — un registro que
 * guardara la contraseña convertiría la propia auditoría en la fuga.
 */
export async function setUserPassword(
  id: string,
  passwordHash: string,
  actorId: string,
): Promise<PublicStaffUser | null> {
  if (!isUuid(id)) return null
  const rows = await db()`
    UPDATE staff_users SET password_hash = ${passwordHash}
    WHERE id = ${id}::uuid RETURNING *
  `
  if (!rows.length) return null
  await recordAudit({
    userId: actorId,
    action: 'user_password_set',
    entity: 'user',
    entityId: id,
    after: { email: rows[0].email, bySelf: actorId === id },
  })
  return toPublicUser(rowToUser(rows[0]))
}

/** Alta o baja. La sesión relee el estado en cada petición, así que una baja
 *  surte efecto de inmediato sobre las sesiones ya abiertas. */
export async function setUserStatus(
  id: string,
  status: 'active' | 'inactive',
  actorId?: string,
): Promise<PublicStaffUser | null> {
  if (!isUuid(id)) return null
  const rows = await db()`
    UPDATE staff_users SET status = ${status} WHERE id = ${id}::uuid RETURNING *
  `
  if (!rows.length) return null
  if (actorId) {
    await recordAudit({
      userId: actorId,
      action: 'user_status_change',
      entity: 'user',
      entityId: id,
      after: { email: rows[0].email, status },
    })
  }
  return toPublicUser(rowToUser(rows[0]))
}
