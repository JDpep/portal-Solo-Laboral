/**
 * RUTA DEL CASO.
 *
 * Los pasos son datos, no código: salen de una plantilla que el despacho puede
 * cambiar sin tocar la aplicación. Al convertir un lead se COPIAN de la
 * plantilla al caso, así que cambiar la plantilla mañana no altera los casos
 * que ya están en curso debajo de quien los está trabajando.
 *
 * `cases.current_stage` no se escribe desde aquí: lo mantiene un trigger de la
 * base a partir del primer paso sin terminar. Una etapa escrita a mano acaba
 * contradiciendo la ruta que se ve al abrir el caso.
 */
import { db, iso, isoRequired, transaction , type Row } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import { recordAudit } from '@/lib/db/audit'
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistTemplate,
  EventType,
} from '@/lib/domain/types'

function rowToItem(row: Row): ChecklistItem {
  return {
    id: row.id,
    caseId: row.case_id,
    templateItemId: row.template_item_id,
    title: row.title,
    description: row.description,
    status: row.status,
    position: row.position,
    assignedUserId: row.assigned_user_id,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    completedBy: row.completed_by,
    notes: row.notes,
    dueAt: iso(row.due_at),
    eventType: row.event_type,
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  }
}

export async function listChecklist(caseId: string): Promise<ChecklistItem[]> {
  if (!isUuid(caseId)) return []
  const rows = await db()`
    SELECT * FROM case_checklist_items WHERE case_id = ${caseId}::uuid ORDER BY position
  `
  return rows.map(rowToItem)
}

/**
 * Los pasos de VARIOS casos a la vez, agrupados por caso.
 *
 * Es lo que permite que Seguimiento pinte una cuadrícula sin hacer una consulta
 * por fila: veinticinco casos en pantalla serían veinticinco viajes a la base,
 * y en serverless cada viaje se paga entero.
 */
export async function listStepsForCases(
  caseIds: string[],
): Promise<Map<string, ChecklistItem[]>> {
  const ids = caseIds.filter(isUuid)
  const grouped = new Map<string, ChecklistItem[]>()
  if (!ids.length) return grouped

  const rows = await db()`
    SELECT * FROM case_checklist_items
    WHERE case_id = ANY(${ids}::uuid[])
    ORDER BY case_id, position
  `
  for (const row of rows) {
    const item = rowToItem(row)
    const list = grouped.get(item.caseId)
    if (list) list.push(item)
    else grouped.set(item.caseId, [item])
  }
  return grouped
}

/**
 * Progreso: pasos terminados sobre pasos que cuentan.
 *
 * Los marcados "no aplica" NO cuentan en el denominador. Si contaran, un caso
 * donde tres pasos no aplican no podría llegar nunca al 100 % y el número
 * dejaría de significar nada.
 */
export function progressOf(items: ChecklistItem[]): { completed: number; total: number } {
  const relevant = items.filter((item) => item.status !== 'not_applicable')
  return {
    completed: relevant.filter((item) => item.status === 'completed').length,
    total: relevant.length,
  }
}

/** El paso en curso, o el siguiente pendiente. Es la "etapa actual". */
export function currentStepOf(items: ChecklistItem[]): ChecklistItem | null {
  return (
    items.find((item) => item.status === 'in_progress') ??
    items.find((item) => item.status === 'pending') ??
    null
  )
}

/**
 * Mueve un paso de estado y deja las fechas coherentes solo.
 *
 * Marcar completado un paso que nadie empezó pone también su fecha de inicio:
 * la alternativa es un paso terminado que nunca empezó, y a la hora de medir
 * cuánto tarda una etapa ese hueco no se puede rellenar después.
 */
export async function setChecklistItemStatus(
  itemId: string,
  status: ChecklistItemStatus,
  userId: string,
): Promise<ChecklistItem | null> {
  if (!isUuid(itemId)) return null
  return transaction(async () => {
    const sql = db()
    const before = await sql`
      SELECT * FROM case_checklist_items WHERE id = ${itemId}::uuid FOR UPDATE
    `
    if (!before.length) return null
    const previous = rowToItem(before[0])

    const rows = await sql`
      UPDATE case_checklist_items SET
        status = ${status}::checklist_item_status,
        started_at = CASE
          WHEN ${status} IN ('in_progress', 'completed') THEN COALESCE(started_at, now())
          ELSE started_at
        END,
        -- El CHECK de la tabla exige que la fecha de término exista si y solo
        -- si el paso está completado. Al deshacer, se limpia.
        completed_at = CASE WHEN ${status} = 'completed' THEN now() ELSE NULL END,
        completed_by = CASE WHEN ${status} = 'completed' THEN ${userId}::uuid ELSE NULL END
      WHERE id = ${itemId}::uuid
      RETURNING *
    `
    await recordAudit({
      userId,
      action:
        status === 'completed'
          ? 'checklist_item_complete'
          : status === 'in_progress'
            ? 'checklist_item_start'
            : 'checklist_item_update',
      entity: 'checklist_item',
      entityId: itemId,
      before: { status: previous.status },
      after: { status, caseId: previous.caseId, title: previous.title },
    })
    return rowToItem(rows[0])
  })
}

export interface UpdateChecklistItemInput {
  notes?: string
  assignedUserId?: string | null
  /** Instante ISO, o null para quitar la fecha. `undefined` = no se toca. */
  dueAt?: string | null
  eventType?: EventType
}

export async function updateChecklistItem(
  itemId: string,
  input: UpdateChecklistItemInput,
  userId: string,
): Promise<ChecklistItem | null> {
  if (!isUuid(itemId)) return null
  return transaction(async () => {
    const sql = db()
    const before = await sql`SELECT * FROM case_checklist_items WHERE id = ${itemId}::uuid`
    if (!before.length) return null
    const previous = rowToItem(before[0])

    const rows = await sql`
      UPDATE case_checklist_items SET
        notes = ${input.notes ?? previous.notes},
        assigned_user_id = ${
          input.assignedUserId === undefined ? previous.assignedUserId : input.assignedUserId
        }::uuid,
        due_at = ${input.dueAt === undefined ? previous.dueAt : input.dueAt}::timestamptz,
        event_type = ${input.eventType ?? previous.eventType}::event_type
      WHERE id = ${itemId}::uuid
      RETURNING *
    `
    // El evento del calendario NO se toca aquí: lo escribe el trigger
    // `checklist_items_alimentan_agenda` a partir de esta misma fila. Hacerlo
    // también desde la aplicación abriría la puerta a que las dos versiones
    // discrepen, que es justo lo que el trigger viene a impedir.
    await recordAudit({
      userId,
      action: 'checklist_item_update',
      entity: 'checklist_item',
      entityId: itemId,
      before: {
        notes: previous.notes,
        assignedUserId: previous.assignedUserId,
        dueAt: previous.dueAt,
        eventType: previous.eventType,
      },
      after: {
        notes: rows[0].notes,
        assignedUserId: rows[0].assigned_user_id,
        dueAt: rows[0].due_at,
        eventType: rows[0].event_type,
      },
    })
    return rowToItem(rows[0])
  })
}

/**
 * Paso añadido a mano a un caso concreto. No toca la plantilla: un asunto
 * puede necesitar una diligencia que los demás no llevan.
 */
export async function addChecklistItem(
  caseId: string,
  input: { title: string; description?: string },
  userId: string,
): Promise<ChecklistItem | null> {
  if (!isUuid(caseId)) return null
  return transaction(async () => {
    const sql = db()
    const rows = await sql`
      INSERT INTO case_checklist_items (case_id, title, description, position)
      SELECT
        ${caseId}::uuid, ${input.title}, ${input.description ?? ''},
        COALESCE(max(position), 0) + 1
      FROM case_checklist_items WHERE case_id = ${caseId}::uuid
      RETURNING *
    `
    await recordAudit({
      userId,
      action: 'checklist_item_update',
      entity: 'checklist_item',
      entityId: rows[0].id,
      after: { caseId, title: input.title, added: true },
    })
    return rowToItem(rows[0])
  })
}

// ────────────────────────────────────────────────────────────────  plantillas

export async function listTemplates(): Promise<ChecklistTemplate[]> {
  const sql = db()
  const templates = await sql`
    SELECT * FROM case_checklist_templates ORDER BY is_default DESC, name
  `
  const items = await sql`
    SELECT * FROM case_checklist_template_items ORDER BY template_id, position
  `
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    isDefault: t.is_default,
    isActive: t.is_active,
    items: items
      .filter((i) => i.template_id === t.id)
      .map((i) => ({
        id: i.id,
        templateId: i.template_id,
        title: i.title,
        description: i.description,
        position: i.position,
      })),
  }))
}

/** La plantilla que se aplica al convertir. Solo puede haber una activa. */
export async function findDefaultTemplate(): Promise<ChecklistTemplate | null> {
  const templates = await listTemplates()
  return templates.find((t) => t.isDefault && t.isActive) ?? null
}
