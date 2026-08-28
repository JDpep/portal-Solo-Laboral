/**
 * BITÁCORA.
 *
 * Append-only de verdad: la tabla tiene un trigger que rechaza UPDATE y
 * DELETE, así que la garantía no depende de que la aplicación se porte bien.
 * Ni un administrador ni este código pueden reescribir lo que ya pasó.
 *
 * Se escribe DENTRO de la transacción de la operación que registra. Si la
 * operación se deshace, su rastro se deshace con ella: una bitácora que
 * afirma cosas que no ocurrieron es peor que no tener bitácora.
 */
import { db, isoRequired } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import type { AuditAction, AuditEntry } from '@/lib/domain/types'

export interface AuditInput {
  userId: string | null
  action: AuditAction
  entity: 'lead' | 'case' | 'checklist_item' | 'event' | 'user' | 'session'
  entityId: string | null
  /** Estado antes y después, para las modificaciones importantes. */
  before?: unknown
  after?: unknown
  ip?: string | null
}

export async function recordAudit(input: AuditInput): Promise<void> {
  await db()`
    INSERT INTO audit_logs (user_id, action, entity, entity_id, before, after, ip)
    VALUES (
      ${input.userId}, ${input.action}, ${input.entity},
      ${input.entityId}, ${input.before ? JSON.stringify(input.before) : null}::jsonb,
      ${input.after ? JSON.stringify(input.after) : null}::jsonb,
      ${input.ip ?? null}
    )
  `
}

/**
 * `jsonb` vuelve del driver como TEXTO, no como objeto.
 *
 * Sin esto, quien lea la bitácora recibe una cadena que parece un objeto y
 * falla en silencio al pedirle un campo: `entrada.after.folio` sale undefined
 * y nadie se entera hasta que una pantalla del histórico aparece vacía.
 */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null
  try {
    return JSON.parse(value)
  } catch {
    // Un valor que no es JSON válido no debería existir, pero perder la
    // entrada entera por ello sería peor que devolverla como texto.
    return value
  }
}

/** Todo lo que le pasó a un registro, en orden. Alimenta el detalle histórico. */
export async function listAuditForEntity(
  entity: AuditInput['entity'],
  entityId: string,
): Promise<AuditEntry[]> {
  if (!isUuid(entityId)) return []
  const rows = await db()`
    SELECT a.*, u.name AS user_name
    FROM audit_logs a
    LEFT JOIN staff_users u ON u.id = a.user_id
    WHERE a.entity = ${entity} AND a.entity_id = ${entityId}::uuid
    ORDER BY a.created_at
  `
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before: parseJson(row.before),
    after: parseJson(row.after),
    ip: row.ip,
    createdAt: isoRequired(row.created_at),
  }))
}
