/**
 * Repositorio de EVENTOS DE CALENDARIO.
 *
 * La agenda operativa del despacho: llamadas, audiencias, conciliaciones y
 * juntas.
 *
 * La agenda se llena por TRES vías, y conviene saber cuál es cuál porque no se
 * cierran igual:
 *
 *   · lo que pide el prospecto desde la web   -> `upsertWebCallEvent`
 *   · la fecha de un paso de la ruta del caso -> un trigger de la base
 *   · una actividad capturada a mano          -> `createEvent`
 *
 * Las dos primeras son un REFLEJO de algo que ya existe en otro sitio, y por eso
 * no se pueden cerrar desde la agenda: se cierran donde nacieron. La tercera no
 * refleja nada, así que se marca realizada o se cancela aquí mismo.
 *
 * El riesgo del alta manual es capturar dos veces la misma audiencia —una en la
 * ruta del caso y otra aquí— y acabar con dos que no coinciden. No lo impide
 * nada; lo único que hace la pantalla es decir de dónde viene cada evento.
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

// ──────────────────────────────────────────────────── alta manual de agenda

export interface CreateEventInput {
  title: string
  eventType: EventType
  /** Instante real (ISO UTC) ya resuelto en la zona del despacho. */
  startAt: string
  endAt?: string | null
  caseId?: string | null
  description?: string
  assignedUserId?: string | null
}

/**
 * Una actividad capturada a mano.
 *
 * `assigned_user_id` cae en quien la crea cuando no se elige responsable ni
 * caso, y no es un detalle: la base exige que todo evento tenga dueño —lead,
 * caso o responsable—, porque una cita que no es de nadie no le sirve a nadie y
 * nunca vuelve a encontrarse.
 */
export async function createEvent(
  input: CreateEventInput,
  createdBy: string,
): Promise<CalendarEvent | null> {
  const caseId = input.caseId && isUuid(input.caseId) ? input.caseId : null
  const assigned =
    input.assignedUserId && isUuid(input.assignedUserId) ? input.assignedUserId : createdBy

  const rows = await db()`
    INSERT INTO calendar_events (
      case_id, event_type, title, description, start_at, end_at,
      assigned_user_id, status, source, created_by
    ) VALUES (
      ${caseId}::uuid, ${input.eventType}::event_type, ${input.title},
      ${input.description ?? ''}, ${input.startAt}::timestamptz,
      ${input.endAt ?? null}::timestamptz, ${assigned}::uuid,
      'scheduled', 'manual', ${createdBy}::uuid
    )
    RETURNING *
  `
  return rows.length ? rowToEvent(rows[0]) : null
}

/**
 * Cancelar una actividad. No la borra: la agenda de un despacho es también el
 * registro de lo que se había previsto y no ocurrió.
 *
 * Igual que `setEventDone`, no alcanza a los eventos que nacieron de un paso de
 * la ruta: esos se quitan borrándole la fecha al paso.
 */
export async function cancelEvent(eventId: string): Promise<CalendarEvent | null> {
  if (!isUuid(eventId)) return null
  const rows = await db()`
    UPDATE calendar_events
       SET status = 'cancelled', cancelled_at = now()
     WHERE id = ${eventId}::uuid
       AND checklist_item_id IS NULL
       AND status <> 'cancelled'
    RETURNING *
  `
  return rows.length ? rowToEvent(rows[0]) : null
}
