/**
 * Repositorio de CASOS.
 *
 * Un caso nace SIEMPRE de un lead y hereda su folio. La conversión es la
 * operación delicada del sistema —crea el caso, copia la ruta, mueve el lead,
 * arrastra sus eventos, anota el estado y firma la bitácora— y por eso no vive
 * aquí sino en la función `convert_lead_to_case` de la base: allí las seis
 * cosas ocurren en una sola transacción y ninguna puede quedar a medias.
 *
 * Nada se borra. Un caso que no continúa se CIERRA con su motivo y pasa al
 * histórico; el registro sigue completo y consultable.
 */
import { db, iso, isoRequired, transaction , type Row } from '@/lib/db/sql'
import { isUuid, rowToLead } from '@/lib/db/leads'
import { recordAudit } from '@/lib/db/audit'
import type {
  Case,
  CaseCloseReason,
  CaseStatus,
  CaseStatusChange,
  CaseSummary,
  Lead,
} from '@/lib/domain/types'

function rowToCase(row: Row): Case {
  return {
    id: row.id,
    folio: row.folio,
    leadId: row.lead_id,
    status: row.status,
    currentStage: row.current_stage,
    assignedUserId: row.assigned_user_id,
    openedAt: isoRequired(row.opened_at),
    closedAt: iso(row.closed_at),
    closedReason: row.closed_reason,
    closedNote: row.closed_note,
    closedBy: row.closed_by,
    createdBy: row.created_by,
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  }
}

// ───────────────────────────────────────────────────────────────── conversión

export type ConvertResult =
  | { ok: true; caseId: string }
  | { ok: false; code: 'not_found' | 'not_visible' | 'already_converted' | 'no_template' }

/**
 * Convierte un lead en caso. Es idempotente en el sentido que importa: el
 * segundo intento no crea un segundo caso, devuelve `already_converted`.
 *
 * La exclusividad no la cuida esta función: la cuida `cases.lead_id UNIQUE`
 * más el `FOR UPDATE` de dentro. Dos abogados pulsando el botón a la vez se
 * serializan en la base, y uno de los dos se va con el error — no con un caso
 * duplicado que después nadie sabe cuál es el bueno.
 */
export async function convertLeadToCase(
  leadId: string,
  userId: string,
  assignedTo?: string | null,
): Promise<ConvertResult> {
  if (!isUuid(leadId)) return { ok: false, code: 'not_found' }
  try {
    const rows = await db()`
      SELECT convert_lead_to_case(
        ${leadId}::uuid, ${userId}::uuid, ${assignedTo ?? null}::uuid, NULL
      ) AS case_id
    `
    return { ok: true, caseId: rows[0].case_id }
  } catch (error) {
    // La función de la base levanta mensajes conocidos; se traducen a un
    // resultado que la interfaz sabe explicar, no a un error crudo de SQL.
    const message = error instanceof Error ? error.message : ''
    if (message.includes('lead_ya_convertido')) return { ok: false, code: 'already_converted' }
    if (message.includes('lead_no_visible')) return { ok: false, code: 'not_visible' }
    if (message.includes('lead_no_encontrado')) return { ok: false, code: 'not_found' }
    if (message.includes('plantilla_no_encontrada')) return { ok: false, code: 'no_template' }
    throw error
  }
}

// ──────────────────────────────────────────────────────────────── seguimiento

export type CaseSortKey = 'folio' | 'openedAt' | 'clientName' | 'status'

const SORT_COLUMN: Record<CaseSortKey, string> = {
  folio: 'folio',
  openedAt: 'opened_at',
  clientName: 'client_name',
  status: 'status',
}

/** Los estados que siguen requiriendo trabajo. Seguimiento muestra estos. */
export const OPEN_STATUSES: CaseStatus[] = ['active', 'waiting_client', 'scheduled', 'in_process']

export interface ListCasesOptions {
  query?: string
  status?: CaseStatus
  assignedUserId?: string
  /** 'open' = en seguimiento; 'closed' = histórico; 'all' = todo. */
  scope?: 'open' | 'closed' | 'all'
  sort?: CaseSortKey
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface CasePage {
  rows: CaseSummary[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/**
 * Una sola consulta para toda la fila de Seguimiento: caso, cliente,
 * responsable, progreso y próximo evento.
 *
 * El progreso y el próximo evento se CALCULAN aquí, en subconsultas, en vez de
 * guardarse en columnas que haya que mantener sincronizadas. Un contador
 * guardado se desincroniza el día que alguien inserta un paso por otra puerta;
 * un `count(*)` no puede mentir.
 */
export async function listCases(options: ListCasesOptions = {}): Promise<CasePage> {
  const sql = db()
  const needle = options.query?.trim() ?? ''
  const like = `%${needle}%`
  const digits = needle.replace(/\D/g, '')
  const scope = options.scope ?? 'open'

  const sort = SORT_COLUMN[options.sort ?? 'openedAt'] ?? 'opened_at'
  const direction = options.direction === 'asc' ? 'asc' : 'desc'
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25))
  const page = Math.max(1, options.page ?? 1)

  const where = sql`
    TRUE
    ${scope === 'open' ? sql`AND c.status = ANY(${OPEN_STATUSES}::case_status[])` : sql``}
    ${scope === 'closed' ? sql`AND NOT (c.status = ANY(${OPEN_STATUSES}::case_status[]))` : sql``}
    ${options.status ? sql`AND c.status = ${options.status}::case_status` : sql``}
    ${
      options.assignedUserId && isUuid(options.assignedUserId)
        ? sql`AND c.assigned_user_id = ${options.assignedUserId}::uuid`
        : sql``
    }
    ${
      needle
        ? sql`AND (
            l.full_name ILIKE ${like}
            OR c.folio ILIKE ${like}
            ${digits.length >= 3 ? sql`OR l.phone LIKE ${`%${digits}%`}` : sql``}
          )`
        : sql``
    }
  `

  const counted = await sql`
    SELECT count(*)::int AS total FROM cases c JOIN leads l ON l.id = c.lead_id WHERE ${where}
  `
  const total = counted[0].total as number
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)

  const rows = await sql`
    SELECT
      c.*,
      l.full_name    AS client_name,
      l.phone        AS phone,
      l.dismissal_date::text AS dismissal_date,
      l.submitted_at AS submitted_at,
      l.is_demo      AS is_demo,
      u.name         AS assigned_user_name,
      (
        SELECT count(*)::int FROM case_checklist_items i
        WHERE i.case_id = c.id AND i.status <> 'not_applicable'
      ) AS steps_total,
      (
        SELECT count(*)::int FROM case_checklist_items i
        WHERE i.case_id = c.id AND i.status = 'completed'
      ) AS steps_done,
      e.id       AS next_event_id,
      e.event_type AS next_event_type,
      e.title    AS next_event_title,
      e.start_at AS next_event_start
    FROM cases c
    JOIN leads l ON l.id = c.lead_id
    LEFT JOIN staff_users u ON u.id = c.assigned_user_id
    -- El próximo evento: el primero que aún no ha pasado y no está cancelado.
    LEFT JOIN LATERAL (
      SELECT id, event_type, title, start_at
      FROM calendar_events
      WHERE case_id = c.id AND status = 'scheduled' AND start_at >= now()
      ORDER BY start_at
      LIMIT 1
    ) e ON TRUE
    WHERE ${where}
    ORDER BY ${sql(sort)} ${direction === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST, c.id ASC
    LIMIT ${pageSize} OFFSET ${(current - 1) * pageSize}
  `

  return {
    rows: rows.map((row) => ({
      ...rowToCase(row),
      clientName: row.client_name,
      phone: String(row.phone).trim(),
      dismissalDate: row.dismissal_date,
      submittedAt: isoRequired(row.submitted_at),
      assignedUserName: row.assigned_user_name,
      isDemo: row.is_demo,
      progress: { completed: row.steps_done, total: row.steps_total },
      nextEvent: row.next_event_id
        ? {
            id: row.next_event_id,
            type: row.next_event_type,
            title: row.next_event_title,
            startAt: isoRequired(row.next_event_start),
          }
        : null,
    })),
    total,
    page: current,
    pageSize,
    pageCount,
  }
}

export interface CaseDetail {
  case: Case
  lead: Lead
  assignedUserName: string | null
}

export async function findCaseById(id: string): Promise<CaseDetail | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    SELECT c.*, u.name AS assigned_user_name, row_to_json(lead_row) AS lead
    FROM cases c
    LEFT JOIN staff_users u ON u.id = c.assigned_user_id
    JOIN LATERAL (
      SELECT
        l.*,
        l.dismissal_date::text        AS dismissal_date,
        l.submitted_on::text          AS submitted_on,
        l.call_preference_date::text  AS call_preference_date
      FROM leads l WHERE l.id = c.lead_id
    ) lead_row ON TRUE
    WHERE c.id = ${id}::uuid
  `
  if (!rows.length) return null
  return {
    case: rowToCase(rows[0]),
    lead: rowToLead(rows[0].lead),
    assignedUserName: rows[0].assigned_user_name,
  }
}

/** El caso al que pertenece un lead, si ya se convirtió. */
export async function findCaseByLeadId(leadId: string): Promise<Case | null> {
  if (!isUuid(leadId)) return null
  const rows = await db()`SELECT * FROM cases WHERE lead_id = ${leadId}::uuid`
  return rows.length ? rowToCase(rows[0]) : null
}

// ──────────────────────────────────────────────────────────── cambios de estado

/**
 * Cambia el estado del caso y lo anota. Las dos cosas o ninguna: un estado
 * cambiado sin su renglón en el historial es exactamente el agujero que
 * impide reconstruir después qué pasó con un caso.
 */
export async function setCaseStatus(
  caseId: string,
  status: CaseStatus,
  userId: string,
  reason = '',
): Promise<Case | null> {
  if (!isUuid(caseId)) return null
  return transaction(async () => {
    const sql = db()
    const before = await sql`SELECT * FROM cases WHERE id = ${caseId}::uuid FOR UPDATE`
    if (!before.length) return null
    const previous = rowToCase(before[0])
    if (previous.status === status) return previous

    const rows = await sql`
      UPDATE cases SET status = ${status}::case_status WHERE id = ${caseId}::uuid RETURNING *
    `
    await sql`
      INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
      VALUES (${caseId}::uuid, ${previous.status}::case_status, ${status}::case_status,
              ${userId}::uuid, ${reason})
    `
    await recordAudit({
      userId,
      action: 'case_status_change',
      entity: 'case',
      entityId: caseId,
      before: { status: previous.status },
      after: { status, reason },
    })
    return rowToCase(rows[0])
  })
}

export async function assignCase(
  caseId: string,
  assignedUserId: string | null,
  userId: string,
): Promise<Case | null> {
  if (!isUuid(caseId)) return null
  return transaction(async () => {
    const sql = db()
    const before = await sql`SELECT * FROM cases WHERE id = ${caseId}::uuid`
    if (!before.length) return null

    const rows = await sql`
      UPDATE cases SET assigned_user_id = ${assignedUserId}::uuid
      WHERE id = ${caseId}::uuid RETURNING *
    `
    await recordAudit({
      userId,
      action: 'case_assign',
      entity: 'case',
      entityId: caseId,
      before: { assignedUserId: before[0].assigned_user_id },
      after: { assignedUserId },
    })
    return rowToCase(rows[0])
  })
}

/**
 * FINALIZAR SEGUIMIENTO. No es borrar: el caso conserva todo y pasa al
 * histórico con su motivo.
 *
 * El motivo decide el estado final, y no al revés: 'completed' termina en
 * `completed`; cualquier otro motivo termina en `discontinued`. Así el
 * histórico puede contar por separado "cuántos se completaron" y "cuántos se
 * cayeron", que son las dos preguntas que el despacho va a hacer.
 */
export async function closeCase(
  caseId: string,
  input: { reason: CaseCloseReason; note?: string },
  userId: string,
): Promise<Case | null> {
  if (!isUuid(caseId)) return null
  const status: CaseStatus = input.reason === 'completed' ? 'completed' : 'discontinued'

  return transaction(async () => {
    const sql = db()
    const before = await sql`SELECT * FROM cases WHERE id = ${caseId}::uuid FOR UPDATE`
    if (!before.length) return null
    const previous = rowToCase(before[0])

    const rows = await sql`
      UPDATE cases SET
        status = ${status}::case_status,
        closed_at = now(),
        closed_reason = ${input.reason}::case_close_reason,
        closed_note = ${input.note ?? ''},
        closed_by = ${userId}::uuid
      WHERE id = ${caseId}::uuid
      RETURNING *
    `
    await sql`
      INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
      VALUES (${caseId}::uuid, ${previous.status}::case_status, ${status}::case_status,
              ${userId}::uuid, ${input.note ?? ''})
    `
    // Los eventos futuros de un caso cerrado se cancelan: dejarlos vivos llena
    // la agenda de audiencias de asuntos que ya no existen.
    await sql`
      UPDATE calendar_events
      SET status = 'cancelled', cancelled_at = now()
      WHERE case_id = ${caseId}::uuid AND status = 'scheduled' AND start_at >= now()
    `
    await recordAudit({
      userId,
      action: 'case_close',
      entity: 'case',
      entityId: caseId,
      before: { status: previous.status },
      after: { status, reason: input.reason, note: input.note ?? '' },
    })
    return rowToCase(rows[0])
  })
}

/** Reabrir: el cierre se conserva en el historial, no se borra. */
export async function reopenCase(caseId: string, userId: string, reason = ''): Promise<Case | null> {
  if (!isUuid(caseId)) return null
  return transaction(async () => {
    const sql = db()
    const before = await sql`SELECT * FROM cases WHERE id = ${caseId}::uuid FOR UPDATE`
    if (!before.length) return null
    const previous = rowToCase(before[0])

    const rows = await sql`
      UPDATE cases SET
        status = 'active', closed_at = NULL, closed_reason = NULL,
        closed_note = '', closed_by = NULL
      WHERE id = ${caseId}::uuid
      RETURNING *
    `
    await sql`
      INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
      VALUES (${caseId}::uuid, ${previous.status}::case_status, 'active', ${userId}::uuid, ${reason})
    `
    await recordAudit({
      userId,
      action: 'case_reopen',
      entity: 'case',
      entityId: caseId,
      before: { status: previous.status, closedReason: previous.closedReason },
      after: { status: 'active', reason },
    })
    return rowToCase(rows[0])
  })
}

/** Historial de estados de un caso, en orden. Nadie puede reescribirlo. */
export async function listStatusHistory(caseId: string): Promise<CaseStatusChange[]> {
  if (!isUuid(caseId)) return []
  const rows = await db()`
    SELECT h.*, u.name AS changed_by_name
    FROM case_status_history h
    LEFT JOIN staff_users u ON u.id = h.changed_by
    WHERE h.case_id = ${caseId}::uuid
    ORDER BY h.changed_at
  `
  return rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name,
    changedAt: isoRequired(row.changed_at),
    reason: row.reason,
  }))
}
