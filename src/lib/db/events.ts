/**
 * Repositorio de EVENTOS DE CALENDARIO.
 *
 * La agenda operativa del despacho: llamadas, audiencias, conciliaciones y
 * juntas. Aquí solo vive, por ahora, lo que produce el formulario público —la
 * llamada que la persona pidió—; el alta manual y las vistas de calendario
 * entran con su módulo.
 *
 * IDEMPOTENCIA: la llamada pedida desde la web es UNA por lead, y lo garantiza
 * un índice único parcial de la base. Si la persona cambia de opinión —elige
 * otra hora, o pide que le llamen enseguida— se ACTUALIZA ese mismo evento en
 * vez de sembrar duplicados en la agenda del abogado. Un formulario reenviado
 * dos veces por una conexión mala no puede convertirse en dos llamadas.
 */
import { db, iso, isoRequired, type Row } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import type { CalendarEvent, EventType } from '@/lib/domain/types'

function rowToEvent(row: Row): CalendarEvent {
  return {
    id: row.id,
    leadId: row.lead_id,
    caseId: row.case_id,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    startAt: isoRequired(row.start_at),
    endAt: iso(row.end_at),
    assignedUserId: row.assigned_user_id,
    status: row.status,
    source: row.source,
    createdBy: row.created_by,
    externalProvider: row.external_provider,
    externalEventId: row.external_event_id,
    cancelledAt: iso(row.cancelled_at),
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  }
}

export interface WebCallEventInput {
  leadId: string
  /** Instante real de la llamada (ISO UTC). */
  startAt: string
  title: string
  description?: string
}

/**
 * Crea —o mueve— la llamada que el prospecto pidió desde la web.
 *
 * `ON CONFLICT` sobre el índice parcial: es la base la que decide que ya había
 * una, no una consulta previa desde la aplicación que dos peticiones
 * simultáneas podrían ganar las dos.
 *
 * Un evento ya cancelado vuelve a 'scheduled': si la persona pide hora otra
 * vez después de que alguien cancelara, lo que quiere es que la llamen.
 */
export async function upsertWebCallEvent(input: WebCallEventInput): Promise<CalendarEvent | null> {
  if (!isUuid(input.leadId)) return null
  const rows = await db()`
    INSERT INTO calendar_events (
      lead_id, event_type, title, description, start_at, status, source
    ) VALUES (
      ${input.leadId}::uuid, 'call', ${input.title}, ${input.description ?? ''},
      ${input.startAt}::timestamptz, 'scheduled', 'web_form'
    )
    ON CONFLICT (lead_id) WHERE source = 'web_form' AND event_type = 'call'
    DO UPDATE SET
      start_at = EXCLUDED.start_at,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      status = 'scheduled',
      cancelled_at = NULL
    RETURNING *
  `
  return rows.length ? rowToEvent(rows[0]) : null
}

/** Todo lo agendado con esta persona, en orden. */
export async function listEventsForLead(leadId: string): Promise<CalendarEvent[]> {
  if (!isUuid(leadId)) return []
  const rows = await db()`
    SELECT * FROM calendar_events WHERE lead_id = ${leadId}::uuid ORDER BY start_at
  `
  return rows.map(rowToEvent)
}

export async function listEventsForCase(caseId: string): Promise<CalendarEvent[]> {
  if (!isUuid(caseId)) return []
  const rows = await db()`
    SELECT * FROM calendar_events WHERE case_id = ${caseId}::uuid ORDER BY start_at
  `
  return rows.map(rowToEvent)
}

/** El próximo evento vivo de un lead. Null si no hay ninguno por delante. */
export async function findNextEventForLead(
  leadId: string,
  types: EventType[] = ['call'],
): Promise<CalendarEvent | null> {
  if (!isUuid(leadId)) return null
  const rows = await db()`
    SELECT * FROM calendar_events
    WHERE lead_id = ${leadId}::uuid
      AND status = 'scheduled'
      AND event_type = ANY(${types}::event_type[])
    ORDER BY start_at
    LIMIT 1
  `
  return rows.length ? rowToEvent(rows[0]) : null
}
