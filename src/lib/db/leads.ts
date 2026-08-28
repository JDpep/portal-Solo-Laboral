/**
 * Repositorio de leads.
 *
 * GARANTÍA CENTRAL DEL SISTEMA: lo que el despacho puede ver lo decide la
 * BASE, en la columna generada `visible_to_staff`, no una consulta que alguien
 * tenga que acordarse de escribir bien:
 *
 *   · del formulario público  ->  solo los que pasaron el filtro;
 *   · capturado por un abogado ->  siempre, porque registrarlo YA fue la
 *                                  decisión que el filtro venía a tomar.
 *
 * Un listado nuevo hereda el filtro por construcción. Y `findLeadForStaff`
 * devuelve null tanto si el id no existe como si el registro no es visible:
 * adivinar ids no puede convertirse en una forma de leer lo que el filtro
 * dejó fuera.
 */
import type { Sql, TransactionSql } from 'postgres'
import { db, iso, isoRequired , type Row } from '@/lib/db/sql'
import type { PlainDate } from '@/lib/dates'
import type { ContactMethod, Lead, LeadSource, LeadStatus } from '@/lib/domain/types'
import type { QualificationReason, QualificationStatus } from '@/lib/domain/qualification'
import type { CallPreference } from '@/lib/domain/call-time'
import type { StateCode } from '@/lib/domain/states'

type Db = Sql | TransactionSql

/**
 * Las fechas civiles salen como texto a propósito: `dismissal_date` no tiene
 * hora ni zona, y dejar que el driver la convierta en Date la corre un día
 * según dónde viva el servidor. Con el límite de 60 días exactos, ese día
 * decide si un caso entra o no.
 */
const columns = (sql: Db) => sql`
  id,
  folio,
  full_name,
  phone,
  state,
  dismissal_date::text AS dismissal_date,
  description,
  source,
  status,
  submitted_at,
  submitted_on::text AS submitted_on,
  qualification_status,
  qualification_reason,
  dismissal_days_at_submission,
  call_preference_date::text AS call_preference_date,
  call_preference_time,
  call_preference_set_at,
  preferred_contact_method,
  whatsapp_opened_at,
  scheduled_call_at,
  contacted_at,
  notes,
  created_by,
  case_id,
  converted_to_case_at,
  is_demo,
  visible_to_staff,
  created_at,
  updated_at
`

export function rowToLead(row: Row): Lead {
  return {
    id: row.id,
    folio: row.folio,
    fullName: row.full_name,
    // char(10) llega con el ancho fijo del tipo; el resto del sistema espera
    // diez dígitos pelados.
    phone: String(row.phone).trim(),
    state: String(row.state).trim() as StateCode,
    dismissalDate: row.dismissal_date,
    description: row.description,
    source: row.source,
    status: row.status,
    submittedAt: isoRequired(row.submitted_at),
    submittedOn: row.submitted_on,
    qualificationStatus: row.qualification_status,
    qualificationReason: row.qualification_reason,
    dismissalDaysAtSubmission: row.dismissal_days_at_submission,
    callPreference: row.call_preference_date
      ? { date: row.call_preference_date, time: row.call_preference_time }
      : null,
    callPreferenceSetAt: iso(row.call_preference_set_at),
    preferredContactMethod: row.preferred_contact_method,
    whatsappOpenedAt: iso(row.whatsapp_opened_at),
    scheduledCallAt: iso(row.scheduled_call_at),
    contactedAt: iso(row.contacted_at),
    notes: row.notes,
    createdBy: row.created_by,
    caseId: row.case_id,
    convertedToCaseAt: iso(row.converted_to_case_at),
    isDemo: row.is_demo,
    visibleToStaff: row.visible_to_staff,
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  }
}

export interface CreateLeadInput {
  fullName: string
  phone: string
  state: StateCode
  dismissalDate: PlainDate
  description: string
  submittedOn: PlainDate
  qualificationStatus: QualificationStatus
  qualificationReason: QualificationReason
  dismissalDaysAtSubmission: number
  /** 'web_form' salvo alta manual. */
  source?: LeadSource
  notes?: string
  /** Quién lo capturó. Null en los envíos del formulario público. */
  createdBy?: string | null
  callPreference?: CallPreference | null
  /** Solo la semilla lo fija; un envío real se sella con la hora en que llegó. */
  submittedAt?: string
  isDemo?: boolean
}

/**
 * Alta de lead. Sirve tanto al formulario público como al alta manual.
 *
 * El FOLIO lo pone la base con `next_folio()`, dentro del mismo INSERT: el
 * consecutivo es una SEQUENCE, así que dos altas simultáneas no pueden
 * llevarse el mismo número ni aunque caigan en el mismo milisegundo. Nadie lo
 * escribe a mano, y la condición para consumirlo es la MISMA expresión que
 * defiende el CHECK de la tabla.
 */
export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const sql = db()
  const source: LeadSource = input.source ?? 'web_form'
  const stamp = input.submittedAt ?? new Date().toISOString()

  const rows = await sql`
    INSERT INTO leads (
      folio, full_name, phone, state, dismissal_date, description,
      source, submitted_at, submitted_on,
      qualification_status, qualification_reason, dismissal_days_at_submission,
      call_preference_date, call_preference_time, call_preference_set_at,
      notes, created_by, is_demo
    ) VALUES (
      CASE
        WHEN ${input.qualificationStatus}::qualification_status = 'qualified'
          OR ${source}::lead_source <> 'web_form'
        THEN next_folio()
        ELSE NULL
      END,
      ${input.fullName}, ${input.phone}, ${input.state},
      ${input.dismissalDate}::date, ${input.description},
      ${source}::lead_source, ${stamp}::timestamptz, ${input.submittedOn}::date,
      ${input.qualificationStatus}::qualification_status,
      ${input.qualificationReason}::qualification_reason,
      ${input.dismissalDaysAtSubmission},
      ${input.callPreference?.date ?? null}::date,
      ${input.callPreference?.time ?? null},
      ${input.callPreference ? stamp : null}::timestamptz,
      ${input.notes ?? ''}, ${input.createdBy ?? null}, ${input.isDemo ?? false}
    )
    RETURNING ${columns(sql)}
  `
  return rowToLead(rows[0])
}

/**
 * Envío repetido: mismo teléfono y mismo despido dentro de la ventana.
 *
 * Cubre el doble clic y el "no vi la confirmación, lo mando otra vez". Se
 * consulta sobre TODOS los envíos, calificados o no: reenviar un formulario
 * que no calificó tampoco debe generar un segundo registro.
 */
export async function findRecentSubmission(
  phone: string,
  dismissalDate: PlainDate,
  withinMs: number,
): Promise<Lead | null> {
  const sql = db()
  const since = new Date(Date.now() - withinMs).toISOString()
  const rows = await sql`
    SELECT ${columns(sql)} FROM leads
    WHERE phone = ${phone}
      AND dismissal_date = ${dismissalDate}::date
      AND submitted_at > ${since}::timestamptz
    ORDER BY submitted_at DESC
    LIMIT 1
  `
  return rows.length ? rowToLead(rows[0]) : null
}

export type LeadSortKey = 'folio' | 'submittedAt' | 'fullName' | 'dismissalDate'

/** Whitelist. La clave de ordenación NUNCA se interpola desde la URL. */
const SORT_COLUMN: Record<LeadSortKey, string> = {
  folio: 'folio',
  submittedAt: 'submitted_at',
  fullName: 'full_name',
  dismissalDate: 'dismissal_date',
}

export interface ListLeadsOptions {
  query?: string
  sort?: LeadSortKey
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /** Filtros del listado. Sin ellos se ven todos los visibles. */
  status?: LeadStatus
  source?: LeadSource
  /** Oculta los que ya se convirtieron en caso: viven en Seguimiento. */
  onlyOpen?: boolean
}

export interface LeadPage {
  rows: Lead[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/**
 * Leads que el despacho puede ver. Nunca devuelve uno que el filtro dejó
 * fuera: el WHERE arranca por `visible_to_staff` y no hay opción para
 * quitarlo.
 */
export async function listLeads(options: ListLeadsOptions = {}): Promise<LeadPage> {
  const sql = db()
  const needle = options.query?.trim() ?? ''
  const digits = needle.replace(/\D/g, '')
  const like = `%${needle}%`

  const sort = SORT_COLUMN[options.sort ?? 'submittedAt'] ?? 'submitted_at'
  const direction = options.direction === 'asc' ? 'asc' : 'desc'

  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25))
  const page = Math.max(1, options.page ?? 1)

  const where = sql`
    visible_to_staff
    ${options.status ? sql`AND status = ${options.status}::lead_status` : sql``}
    ${options.source ? sql`AND source = ${options.source}::lead_source` : sql``}
    ${options.onlyOpen ? sql`AND case_id IS NULL` : sql``}
    ${
      needle
        ? sql`AND (
            full_name ILIKE ${like}
            OR folio ILIKE ${like}
            ${digits.length >= 3 ? sql`OR phone LIKE ${`%${digits}%`}` : sql``}
          )`
        : sql``
    }
  `

  const counted = await sql`SELECT count(*)::int AS total FROM leads WHERE ${where}`
  const total = counted[0].total as number
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)

  const rows = await sql`
    SELECT ${columns(sql)} FROM leads
    WHERE ${where}
    -- El desempate por id no es cosmético: sin él, dos registros con el mismo
    -- sello salen en orden indefinido y la lista baila entre recargas. Va SIN
    -- la dirección: invertirla reordena el criterio, no los empates.
    ORDER BY ${sql(sort)} ${direction === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST, id ASC
    LIMIT ${pageSize} OFFSET ${(current - 1) * pageSize}
  `

  return { rows: rows.map(rowToLead), total, page: current, pageSize, pageCount }
}

/**
 * Detalle de un lead para el portal. Null si no existe O si no es visible.
 * Las dos respuestas son indistinguibles a propósito.
 */
export async function findLeadForStaff(id: string): Promise<Lead | null> {
  const sql = db()
  // El id llega de la URL: si no es un uuid, la consulta ni se hace. Sin esto
  // Postgres responde con un error de sintaxis en vez de un 404 limpio.
  if (!isUuid(id)) return null
  const rows = await sql`
    SELECT ${columns(sql)} FROM leads WHERE id = ${id}::uuid AND visible_to_staff
  `
  return rows.length ? rowToLead(rows[0]) : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Guarda (o sustituye) la hora pedida para la llamada.
 *
 * SOLO sobre un lead visible. La comprobación vive aquí y no en la acción por
 * la misma razón que el filtro del listado: quien entre después por otra
 * puerta hereda la garantía en vez de tener que acordarse de ella.
 */
export async function setCallPreference(
  id: string,
  preference: CallPreference,
): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET
      call_preference_date = ${preference.date}::date,
      call_preference_time = ${preference.time},
      call_preference_set_at = now()
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/** Cambia el estado del lead. `converted` lo pone la conversión, no esto. */
export async function setLeadStatus(id: string, status: LeadStatus): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET status = ${status}::lead_status
    WHERE id = ${id}::uuid AND visible_to_staff AND status <> 'converted'
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/** Notas internas. No las ve nadie fuera del despacho. */
export async function setLeadNotes(id: string, notes: string): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET notes = ${notes}
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/** Conteo por resultado del filtro. Alimenta las métricas del histórico. */
export async function countLeadsByStatus(): Promise<Record<QualificationStatus, number>> {
  const sql = db()
  const rows = await sql`
    SELECT qualification_status, count(*)::int AS total FROM leads GROUP BY 1
  `
  const out: Record<QualificationStatus, number> = { qualified: 0, unqualified: 0 }
  for (const row of rows) out[row.qualification_status as QualificationStatus] = row.total
  return out
}

// ──────────────────────────────────────────────────── cómo quiere que le hablen

/**
 * Guarda la vía que la persona eligió tras calificar.
 *
 * SOLO sobre un lead visible, igual que todo lo demás de este repositorio: a
 * quien no pasó el filtro nunca se le ofrecen las opciones, y la comprobación
 * vive aquí para que quien entre mañana por otra puerta la herede.
 *
 * NO toca el estado del lead. Elegir WhatsApp no es haber sido contactado.
 */
export async function setPreferredContactMethod(
  id: string,
  method: ContactMethod,
): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET preferred_contact_method = ${method}::contact_method
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/**
 * Sella que la persona ABRIÓ WhatsApp con el mensaje preparado.
 *
 * Lo que se guarda es exactamente eso y ni un milímetro más. Con un enlace
 * wa.me el sistema pierde de vista a la persona en cuanto salta a la
 * aplicación: no sabe si envió, si lo pensó mejor, o si se le acabó la
 * batería. Guardar "mensaje enviado" aquí llenaría el portal de conversaciones
 * que el abogado creería tener y no tiene.
 *
 * Se queda con la PRIMERA vez: es la que dice cuánto tardó en dar el paso.
 */
export async function markWhatsAppOpened(id: string): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET
      preferred_contact_method = 'whatsapp',
      whatsapp_opened_at = COALESCE(whatsapp_opened_at, now())
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/** Llamada próxima: guarda la preferencia y el momento previsto. */
export async function setQuickCall(id: string, scheduledFor: string): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET
      preferred_contact_method = 'quick_call',
      scheduled_call_at = ${scheduledFor}::timestamptz
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}

/**
 * Contacto REAL con la persona. Lo marca el despacho, no una automatización:
 * hoy no existe ninguna señal fiable de que alguien haya hablado con ella.
 */
export async function markContacted(id: string): Promise<Lead | null> {
  const sql = db()
  if (!isUuid(id)) return null
  const rows = await sql`
    UPDATE leads SET
      contacted_at = COALESCE(contacted_at, now()),
      status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
    WHERE id = ${id}::uuid AND visible_to_staff
    RETURNING ${columns(sql)}
  `
  return rows.length ? rowToLead(rows[0]) : null
}
