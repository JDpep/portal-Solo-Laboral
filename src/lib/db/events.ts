/**
 * Repositorio de EVENTOS DE CALENDARIO.
 *
 * La agenda operativa del despacho: llamadas, audiencias, conciliaciones y
 * juntas.
 *
 * NADIE CAPTURA EVENTOS A MANO, y es deliberado. La agenda es un REFLEJO de dos
 * cosas que ya existen en otro sitio:
 *
 *   · lo que pide el prospecto desde la web  -> `upsertWebCallEvent`, aquí
 *   · la fecha de un paso de la ruta del caso -> un trigger de la base
 *
 * Un alta manual aparte convertiría la agenda en una tercera versión de los
 * mismos hechos, y la tercera versión es siempre la que se queda desactualizada.
 * Para agendar una audiencia se le pone fecha a su paso en la ruta del caso.
 *
 * IDEMPOTENCIA: la llamada pedida desde la web es UNA por lead, y lo garantiza
 * un índice único parcial de la base. Si la persona cambia de opinión —elige
 * otra hora, o pide que le llamen enseguida— se ACTUALIZA ese mismo evento en
 * vez de sembrar duplicados en la agenda del abogado. Un formulario reenviado
 * dos veces por una conexión mala no puede convertirse en dos llamadas.
 */
import { db, iso, isoRequired, type Row } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import type { AgendaEvent, CalendarEvent, EventType } from '@/lib/domain/types'

function rowToEvent(row: Row): CalendarEvent {
  return {
    id: row.id,
    leadId: row.lead_id,
    caseId: row.case_id,
    checklistItemId: row.checklist_item_id ?? null,
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

// ──────────────────────────────────────────────────────────────────── agenda

/**
 * Los eventos de un rango, con el contexto que hace legible cada renglón.
 *
 * `from` y `to` son instantes ISO y el rango es semiabierto [from, to): así dos
 * días consecutivos no se disputan la medianoche y ningún evento sale dos veces.
 *
 * Los cancelados NO salen. Una agenda que muestra lo cancelado junto a lo vivo
 * obliga a leer el estado de cada renglón antes de saber si hay que hacer algo.
 */
export async function listAgenda(options: {
  from: string
  to: string
  assignedUserId?: string
}): Promise<AgendaEvent[]> {
  const sql = db()
  const rows = await sql`
    SELECT
      e.*,
      COALESCE(lc.full_name, l.full_name) AS client_name,
      COALESCE(c.folio, l.folio)          AS folio,
      COALESCE(lc.phone, l.phone)         AS phone,
      COALESCE(lc.is_demo, l.is_demo, false) AS is_demo,
      u.name                              AS assigned_user_name
    FROM calendar_events e
    LEFT JOIN leads l        ON l.id = e.lead_id
    LEFT JOIN cases c        ON c.id = e.case_id
    LEFT JOIN leads lc       ON lc.id = c.lead_id
    LEFT JOIN staff_users u  ON u.id = e.assigned_user_id
    WHERE e.status <> 'cancelled'
      AND e.start_at >= ${options.from}::timestamptz
      AND e.start_at <  ${options.to}::timestamptz
      ${
        options.assignedUserId && isUuid(options.assignedUserId)
          ? sql`AND e.assigned_user_id = ${options.assignedUserId}::uuid`
          : sql``
      }
    ORDER BY e.start_at, e.created_at
  `
  return rows.map(rowToAgendaEvent)
}

/**
 * Lo que ya pasó y sigue marcado como agendado: llamadas que nadie devolvió,
 * audiencias sin resultado.
 *
 * Va aparte y arriba de la agenda a propósito. Un pendiente atrasado no aparece
 * en "esta semana" —su fecha quedó atrás— y sin este bloque desaparecería de la
 * pantalla justo cuando más urge.
 */
export async function listOverdue(before: string, limit = 50): Promise<AgendaEvent[]> {
  const rows = await db()`
    SELECT
      e.*,
      COALESCE(lc.full_name, l.full_name) AS client_name,
      COALESCE(c.folio, l.folio)          AS folio,
      COALESCE(lc.phone, l.phone)         AS phone,
      COALESCE(lc.is_demo, l.is_demo, false) AS is_demo,
      u.name                              AS assigned_user_name
    FROM calendar_events e
    LEFT JOIN leads l       ON l.id = e.lead_id
    LEFT JOIN cases c       ON c.id = e.case_id
    LEFT JOIN leads lc      ON lc.id = c.lead_id
    LEFT JOIN staff_users u ON u.id = e.assigned_user_id
    WHERE e.status = 'scheduled' AND e.start_at < ${before}::timestamptz
    ORDER BY e.start_at DESC
    LIMIT ${limit}
  `
  return rows.map(rowToAgendaEvent)
}

function rowToAgendaEvent(row: Row): AgendaEvent {
  return {
    ...rowToEvent(row),
    clientName: row.client_name ?? null,
    folio: row.folio ?? null,
    phone: row.phone ? String(row.phone).trim() : null,
    assignedUserName: row.assigned_user_name ?? null,
    isDemo: Boolean(row.is_demo),
  }
}

/**
 * Marcar un evento como realizado, o devolverlo a agendado.
 *
 * Solo alcanza a los eventos que NO vienen de un paso de la ruta: los que sí
 * vienen se cierran completando su paso, y dejar que se cierren por los dos
 * lados haría que la agenda y la ruta pudieran contar cosas distintas del mismo
 * hecho. La consulta lo impone; no es una regla escrita solo en la pantalla.
 */
export async function setEventDone(
  eventId: string,
  done: boolean,
): Promise<CalendarEvent | null> {
  if (!isUuid(eventId)) return null
  const rows = await db()`
    UPDATE calendar_events
       SET status = ${done ? 'done' : 'scheduled'}::event_status
     WHERE id = ${eventId}::uuid
       AND checklist_item_id IS NULL
       AND status <> 'cancelled'
    RETURNING *
  `
  return rows.length ? rowToEvent(rows[0]) : null
}
