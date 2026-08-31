'use server'

/**
 * ACCIONES DE LA AGENDA.
 *
 * Aquí se capturan actividades a mano: una junta con el cliente, una diligencia,
 * un recordatorio. Conviven con las dos vías que se llenan solas —la llamada que
 * pide el prospecto desde la web y la fecha de un paso de la ruta— y no las
 * sustituyen.
 *
 * AVISO que la pantalla también da: agendar aquí una audiencia que además tiene
 * su paso en la ruta del caso deja DOS registros del mismo hecho. Nada lo
 * impide; conviene ponerle la fecha al paso y dejar que aparezca sola.
 */
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/guard'
import { cancelEvent, createEvent, setEventDone } from '@/lib/db/events'
import { instantFrom, isPlainDate } from '@/lib/dates'
import type { EventType } from '@/lib/domain/types'

const EVENT_TYPES: EventType[] = [
  'call',
  'hearing',
  'conciliation',
  'meeting',
  'follow_up',
  'deadline',
  'other',
]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface EventState {
  error?: string
  ok?: string
  /**
   * Sello de este resultado. La pantalla lo usa para saber que hubo un guardado
   * NUEVO: dos actividades seguidas devuelven el mismo `ok` y sin algo que
   * cambie, el popover no se enteraría del segundo y se quedaría abierto.
   */
  token?: number
}

/**
 * NUEVA ACTIVIDAD.
 *
 * El día y la hora llegan por separado y en hora del despacho; se convierten
 * aquí a un instante real. Componer la cadena a mano la interpretaría en la zona
 * del SERVIDOR, y una audiencia capturada desde una función en Virginia saldría
 * corrida en la agenda del abogado.
 */
export async function createEventAction(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  const user = await requireStaff()

  const title = String(formData.get('title') ?? '').trim().slice(0, 200)
  const eventType = String(formData.get('eventType') ?? '') as EventType
  const day = String(formData.get('day') ?? '').trim()
  const time = String(formData.get('time') ?? '').trim()
  const endTime = String(formData.get('endTime') ?? '').trim()
  const caseId = String(formData.get('caseId') ?? '') || null
  const assignedUserId = String(formData.get('assignedUserId') ?? '') || null
  const description = String(formData.get('description') ?? '').trim().slice(0, 1000)

  if (!title) return { error: 'Escribe de qué es la actividad.' }
  if (!EVENT_TYPES.includes(eventType)) return { error: 'Elige qué tipo de actividad es.' }
  if (!isPlainDate(day)) return { error: 'Elige el día.' }
  if (!TIME_RE.test(time)) return { error: 'Elige la hora de inicio.' }
  if (endTime && !TIME_RE.test(endTime)) return { error: 'La hora de fin no es válida.' }
  // La base también lo rechaza; aquí se explica en vez de reventar.
  if (endTime && endTime <= time) return { error: 'La hora de fin tiene que ser posterior al inicio.' }

  const created = await createEvent(
    {
      title,
      eventType,
      startAt: instantFrom(day, time),
      endAt: endTime ? instantFrom(day, endTime) : null,
      caseId,
      description,
      assignedUserId,
    },
    user.id,
  )
  if (!created) return { error: 'No se pudo guardar la actividad. Inténtalo de nuevo.' }

  revalidatePath('/portal/calendario')
  if (caseId) revalidatePath(`/portal/seguimiento/${caseId}`)
  return { ok: 'Actividad agendada.', token: Date.now() }
}

export async function setEventDoneAction(formData: FormData): Promise<void> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')
  const done = String(formData.get('done') ?? '') === 'si'

  await setEventDone(eventId, done)
  revalidatePath('/portal/calendario')
}

export async function cancelEventAction(formData: FormData): Promise<void> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')

  await cancelEvent(eventId)
  revalidatePath('/portal/calendario')
}
