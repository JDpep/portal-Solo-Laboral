/**
 * Repositorio de solicitudes recibidas.
 *
 * GARANTÍA CENTRAL DEL SISTEMA: las funciones que alimentan el portal de
 * abogados (`listQualifiedLeads`, `findQualifiedLeadById`) filtran por
 * `qualificationStatus === 'qualified'` AQUÍ, no en la página. Un futuro
 * listado nuevo hereda el filtro por construcción en vez de tener que
 * acordarse de aplicarlo.
 */
import { clone, cloneAll, getStore, newId } from '@/lib/db/store'
import { nowIso } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import type { Lead } from '@/lib/domain/types'
import type { QualificationReason, QualificationStatus } from '@/lib/domain/qualification'
import type { CallPreference } from '@/lib/domain/call-slot'
import type { StateCode } from '@/lib/domain/states'

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
  /**
   * Solo lo fija la semilla de Fase 1. Un envío real NUNCA lo manda: su id lo
   * genera el repositorio.
   *
   * Existe porque el almacén vive en memoria y en producción hay muchas
   * instancias, cada una con su propia copia sembrada. Con ids generados al
   * vuelo, el listado que pinta una instancia enlazaba a casos que otra no
   * conocía, y el detalle respondía 404. Sembrar ids estables hace que todas
   * las instancias coincidan. En Fase 2, con Postgres, el dato es uno solo y
   * este campo desaparece.
   */
  id?: string
  /**
   * Igual que `id`, y por la misma razón: solo la semilla lo fija. Un envío
   * real se sella con la hora en que llegó.
   *
   * El listado ordena por este campo. Si cada instancia sembrara con su propio
   * instante, la misma lista saldría en distinto orden según a quién le tocara
   * responder.
   */
  submittedAt?: string
  /** Solo lo pone la semilla de Fase 1; un envío real siempre es false. */
  isDemo?: boolean
  /** Solo la semilla la trae de nacimiento; un envío real la elige después. */
  callPreference?: CallPreference | null
}

/** "SL-000001". Seis dígitos alcanzan para 999 999 solicitudes. */
function nextCaseNumber(): string {
  const store = getStore()
  store.caseSequence += 1
  return `SL-${String(store.caseSequence).padStart(6, '0')}`
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const stamp = input.submittedAt ?? nowIso()
  const lead: Lead = {
    id: input.id ?? newId('lead'),
    // El folio es un recurso escaso y visible: solo lo consume quien califica.
    caseNumber: input.qualificationStatus === 'qualified' ? nextCaseNumber() : null,
    fullName: input.fullName,
    phone: input.phone,
    state: input.state,
    dismissalDate: input.dismissalDate,
    description: input.description,
    submittedAt: stamp,
    submittedOn: input.submittedOn,
    qualificationStatus: input.qualificationStatus,
    qualificationReason: input.qualificationReason,
    dismissalDaysAtSubmission: input.dismissalDaysAtSubmission,
    // La franja se elige en la pantalla siguiente, nunca en el envío.
    callPreference: input.callPreference ?? null,
    callPreferenceSetAt: input.callPreference ? stamp : null,
    isDemo: input.isDemo ?? false,
    createdAt: stamp,
  }
  getStore().leads.push(lead)
  return clone(lead)
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
  const now = Date.now()
  const match = getStore()
    .leads.filter(
      (l) =>
        l.phone === phone &&
        l.dismissalDate === dismissalDate &&
        // Estrictamente menor: una ventana de 0 no encuentra nada, ni siquiera
        // el registro que acaba de escribirse en este mismo milisegundo.
        now - Date.parse(l.submittedAt) < withinMs,
    )
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0]
  return match ? clone(match) : null
}

export type LeadSortKey = 'caseNumber' | 'submittedAt' | 'fullName' | 'dismissalDate'

export interface ListQualifiedOptions {
  query?: string
  sort?: LeadSortKey
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface LeadPage {
  rows: Lead[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/** Casos por contactar. Solo calificados; nunca devuelve un `unqualified`. */
export async function listQualifiedLeads(options: ListQualifiedOptions = {}): Promise<LeadPage> {
  const needle = options.query?.trim().toLowerCase() ?? ''
  const digits = needle.replace(/\D/g, '')

  const filtered = getStore().leads.filter((lead) => {
    if (lead.qualificationStatus !== 'qualified') return false
    if (!needle) return true
    if (lead.fullName.toLowerCase().includes(needle)) return true
    if (lead.caseNumber && lead.caseNumber.toLowerCase().includes(needle)) return true
    if (digits.length >= 3 && lead.phone.includes(digits)) return true
    return false
  })

  const sort = options.sort ?? 'submittedAt'
  const direction = options.direction ?? 'desc'
  const factor = direction === 'asc' ? 1 : -1
  // El desempate por id no es cosmético: sin él, dos solicitudes con el mismo
  // `submittedAt` —la semilla las crea en el mismo milisegundo— quedan en
  // orden indefinido, y cada instancia pinta la lista en un orden distinto.
  // El desempate va SIN `factor`: invertir la dirección no debe reordenar
  // los empates, solo el criterio principal.
  const rows = cloneAll(filtered).sort(
    (a, b) => factor * compareBy(a, b, sort) || a.id.localeCompare(b.id),
  )

  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25))
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, options.page ?? 1))
  const start = (page - 1) * pageSize

  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    pageCount,
  }
}

function compareBy(a: Lead, b: Lead, key: LeadSortKey): number {
  switch (key) {
    case 'fullName':
      return a.fullName.localeCompare(b.fullName, 'es')
    case 'caseNumber':
      return (a.caseNumber ?? '').localeCompare(b.caseNumber ?? '', 'es')
    case 'dismissalDate':
      return a.dismissalDate < b.dismissalDate ? -1 : a.dismissalDate > b.dismissalDate ? 1 : 0
    case 'submittedAt':
    default:
      return a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0
  }
}

/**
 * Guarda (o sustituye) la franja pedida para la llamada.
 *
 * SOLO sobre un lead calificado. La comprobación vive aquí y no en la acción
 * por la misma razón que el filtro del portal: quien entre después por otra
 * puerta hereda la garantía en vez de tener que acordarse de ella.
 *
 * Devuelve null si el caso no existe o no calificó — indistinguibles a
 * propósito, para que nadie pueda usar esta función para averiguar si un id
 * corresponde a una solicitud rechazada.
 */
export async function setCallPreference(
  id: string,
  preference: CallPreference,
): Promise<Lead | null> {
  const lead = getStore().leads.find((l) => l.id === id)
  if (!lead || lead.qualificationStatus !== 'qualified') return null
  lead.callPreference = { ...preference }
  lead.callPreferenceSetAt = nowIso()
  return clone(lead)
}

/**
 * Detalle de un caso. Devuelve null si el id no existe O si el registro no
 * calificó: para el portal, un no calificado sencillamente no está ahí, y
 * adivinar ids no puede convertirse en una forma de leerlos.
 */
export async function findQualifiedLeadById(id: string): Promise<Lead | null> {
  const lead = getStore().leads.find((l) => l.id === id)
  if (!lead || lead.qualificationStatus !== 'qualified') return null
  return clone(lead)
}

/** Conteo por resultado. Uso interno/diagnóstico, no se expone en el portal. */
export async function countLeadsByStatus(): Promise<Record<QualificationStatus, number>> {
  const out: Record<QualificationStatus, number> = {
    qualified: 0,
    unqualified: 0,
  }
  for (const lead of getStore().leads) out[lead.qualificationStatus] += 1
  return out
}
