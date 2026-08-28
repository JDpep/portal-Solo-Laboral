'use server'

/**
 * ACCIONES DE SEGUIMIENTO.
 *
 * Todas empiezan igual, y no es ceremonia: `requireStaff()` comprueba la
 * sesión EN EL SERVIDOR. Que el botón no se pinte no protege nada — quien
 * mande el POST a mano tiene que chocar contra esta misma pared.
 *
 * Ninguna acción confía en los ids que le llegan: los repositorios validan que
 * sean uuid y que el registro sea visible antes de tocar nada.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth/guard'
import { convertLeadToCase, assignCase, closeCase, reopenCase, setCaseStatus } from '@/lib/db/cases'
import { addChecklistItem, setChecklistItemStatus, updateChecklistItem } from '@/lib/db/checklist'
import { setLeadStatus } from '@/lib/db/leads'
import { instantFrom, isPlainDate } from '@/lib/dates'
import type {
  CaseCloseReason,
  CaseStatus,
  ChecklistItemStatus,
  EventType,
} from '@/lib/domain/types'

const CLOSE_REASONS: CaseCloseReason[] = [
  'completed',
  'client_declined',
  'client_unresponsive',
  'not_viable',
  'other',
]

const CASE_STATUSES: CaseStatus[] = [
  'active',
  'waiting_client',
  'scheduled',
  'in_process',
  'completed',
  'discontinued',
  'archived',
]

const ITEM_STATUSES: ChecklistItemStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'not_applicable',
]

const EVENT_TYPES: EventType[] = [
  'call',
  'hearing',
  'conciliation',
  'meeting',
  'follow_up',
  'deadline',
  'other',
]

/** "HH:MM" en reloj de 24 horas. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface ConvertState {
  error?: string
}

/**
 * CONVERTIR EN CASO.
 *
 * En cuanto sale bien, redirige a la ruta del caso recién creada: la razón de
 * convertir es ponerse a trabajarlo, y dejar al abogado en la ficha del lead
 * lo obligaría a buscar en Seguimiento lo que acaba de crear.
 *
 * `redirect()` va FUERA del try: lanza una excepción de control interna de
 * Next, y atraparla convertiría una conversión correcta en un mensaje de error.
 */
export async function convertLeadAction(
  _prev: ConvertState,
  formData: FormData,
): Promise<ConvertState> {
  const user = await requireStaff()
  const leadId = String(formData.get('leadId') ?? '')
  // Sin responsable elegido, el caso queda a nombre de quien lo convirtió. Un
  // caso "sin asignar" no es de nadie: no sale en la carga de trabajo de ningún
  // abogado y solo se descubre cuando alguien lo busca por casualidad. Quien
  // decidió tomar el asunto es el candidato obvio, y cambiarlo es un desplegable.
  const assignedTo = String(formData.get('assignedTo') ?? '') || user.id

  const result = await convertLeadToCase(leadId, user.id, assignedTo)
  if (!result.ok) {
    return { error: convertErrorMessage(result.code) }
  }

  revalidatePath('/portal')
  revalidatePath('/portal/seguimiento')
  redirect(`/portal/seguimiento/${result.caseId}`)
}

function convertErrorMessage(code: string): string {
  switch (code) {
    case 'already_converted':
      // Puede pasar sin que nadie haga nada raro: dos abogados abriendo el
      // mismo lead a la vez. El mensaje lo trata como lo que es.
      return 'Este lead ya se convirtió en caso. Actualiza la página para verlo.'
    case 'not_visible':
    case 'not_found':
      return 'No encontramos ese lead.'
    case 'no_template':
      return 'No hay una plantilla de ruta activa. Configúrala antes de convertir.'
    default:
      return 'No se pudo convertir el lead. Inténtalo de nuevo.'
  }
}

/** Descartar un lead sin convertirlo: tampoco se borra, se marca. */
export async function setLeadStatusAction(formData: FormData): Promise<void> {
  await requireStaff()
  const leadId = String(formData.get('leadId') ?? '')
  const status = String(formData.get('status') ?? '')
  if (status !== 'contacted' && status !== 'discarded' && status !== 'no_response') return

  await setLeadStatus(leadId, status)
  revalidatePath('/portal')
  revalidatePath(`/portal/${leadId}`)
}

/** Mover un paso de la ruta. La fecha de inicio y de término las pone la base. */
export async function setStepStatusAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const itemId = String(formData.get('itemId') ?? '')
  const caseId = String(formData.get('caseId') ?? '')
  const status = String(formData.get('status') ?? '') as ChecklistItemStatus
  if (!ITEM_STATUSES.includes(status)) return

  await setChecklistItemStatus(itemId, status, user.id)
  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
  // Completar un paso con fecha marca su evento como realizado —lo hace el
  // trigger—, así que la agenda que estaba en caché ya no dice la verdad.
  revalidatePath('/portal/calendario')
}

/**
 * Notas, responsable y FECHA de un paso.
 *
 * La fecha es lo único que hay que capturar para que algo aparezca en la
 * agenda: no existe un alta de eventos aparte. La pantalla manda día y hora por
 * separado, en hora del despacho, y aquí se convierten a un instante real —si
 * se compusiera la cadena a mano, una audiencia agendada desde un servidor en
 * Virginia saldría corrida en la agenda del abogado.
 *
 * Día sin hora se toma como las 9:00: en la agenda del despacho un pendiente
 * sin hora es un pendiente de primera hora, no de medianoche.
 */
export async function updateStepAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const itemId = String(formData.get('itemId') ?? '')
  const caseId = String(formData.get('caseId') ?? '')
  const notes = String(formData.get('notes') ?? '').slice(0, 2000)
  const assignedRaw = String(formData.get('assignedUserId') ?? '')
  const dueDate = String(formData.get('dueDate') ?? '').trim()
  const dueTimeRaw = String(formData.get('dueTime') ?? '').trim()
  const eventTypeRaw = String(formData.get('eventType') ?? '') as EventType

  // Fecha inválida se trata como "sin fecha" en vez de reventar: el resto del
  // formulario —las notas, el responsable— no tiene por qué perderse porque el
  // navegador mandara algo raro en un campo opcional.
  const dueAt = isPlainDate(dueDate)
    ? instantFrom(dueDate, TIME_RE.test(dueTimeRaw) ? dueTimeRaw : '09:00')
    : null

  await updateChecklistItem(
    itemId,
    {
      notes,
      assignedUserId: assignedRaw || null,
      dueAt,
      eventType: EVENT_TYPES.includes(eventTypeRaw) ? eventTypeRaw : undefined,
    },
    user.id,
  )
  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
  revalidatePath('/portal/calendario')
}


export async function addStepAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const caseId = String(formData.get('caseId') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 200)
  if (!title) return

  await addChecklistItem(caseId, { title }, user.id)
  revalidatePath(`/portal/seguimiento/${caseId}`)
}

export async function setCaseStatusAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const caseId = String(formData.get('caseId') ?? '')
  const status = String(formData.get('status') ?? '') as CaseStatus
  if (!CASE_STATUSES.includes(status)) return

  await setCaseStatus(caseId, status, user.id)
  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
}

export async function assignCaseAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const caseId = String(formData.get('caseId') ?? '')
  const assignedUserId = String(formData.get('assignedUserId') ?? '') || null

  await assignCase(caseId, assignedUserId, user.id)
  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
}

export interface CloseCaseState {
  error?: string
}

/**
 * FINALIZAR SEGUIMIENTO. No borra nada: el caso conserva su ruta, sus eventos
 * y su historia, y pasa al histórico con el motivo.
 *
 * "Otro" exige nota. Sin ella el histórico acabaría lleno de casos cerrados
 * por un motivo que nadie puede reconstruir seis meses después — que es
 * exactamente lo que el histórico viene a evitar.
 */
export async function closeCaseAction(
  _prev: CloseCaseState,
  formData: FormData,
): Promise<CloseCaseState> {
  const user = await requireStaff()
  const caseId = String(formData.get('caseId') ?? '')
  const reason = String(formData.get('reason') ?? '') as CaseCloseReason
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000)

  if (!CLOSE_REASONS.includes(reason)) {
    return { error: 'Elige por qué se termina el seguimiento.' }
  }
  if (reason === 'other' && !note) {
    return { error: 'Escribe el motivo: es lo que va a leerse en el histórico.' }
  }

  const closed = await closeCase(caseId, { reason, note }, user.id)
  if (!closed) return { error: 'No encontramos ese caso.' }

  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
  revalidatePath('/portal/historico')
  return {}
}

export async function reopenCaseAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  const caseId = String(formData.get('caseId') ?? '')
  const reason = String(formData.get('reason') ?? '').slice(0, 500)

  await reopenCase(caseId, user.id, reason)
  revalidatePath(`/portal/seguimiento/${caseId}`)
  revalidatePath('/portal/seguimiento')
  revalidatePath('/portal/historico')
}
