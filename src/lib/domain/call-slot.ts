/**
 * FRANJA SOLICITADA PARA LA LLAMADA.
 *
 * Lo que la persona elige NO es una cita: es una franja en la que prefiere que
 * le marquen. El despacho no publica disponibilidad ni existe una agenda
 * contra la cual reservar, así que ofrecer "11:30" sería inventar un
 * compromiso que nadie puede sostener — y el producto entero está construido
 * sobre no prometer de más (ver el copy de `SubmissionResult`).
 *
 * Por eso se piden dos cosas y ninguna más: qué día y si por la mañana o por
 * la tarde. Es la información que el abogado necesita para no llamar cuando la
 * persona está trabajando, que es el único problema que esto resuelve.
 *
 * Función pura y sin dependencias del navegador: se valida igual en el
 * servidor, que es donde manda.
 */
import { addDays, compareDates, isPlainDate } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'

export type CallSlot = 'morning' | 'afternoon'

export const CALL_SLOTS: CallSlot[] = ['morning', 'afternoon']

export const CALL_SLOT_LABEL: Record<CallSlot, string> = {
  morning: 'Por la mañana',
  afternoon: 'Por la tarde',
}

/** Horario que el rótulo promete. Una sola verdad, usada en ambas caras. */
export const CALL_SLOT_RANGE: Record<CallSlot, string> = {
  morning: '9:00 a 14:00 h',
  afternoon: '14:00 a 19:00 h',
}

/** Forma corta para la tabla del portal: "mar 26 · tarde". */
export const CALL_SLOT_SHORT: Record<CallSlot, string> = {
  morning: 'mañana',
  afternoon: 'tarde',
}

export interface CallPreference {
  date: PlainDate
  slot: CallSlot
}

export function isCallSlot(value: unknown): value is CallSlot {
  return value === 'morning' || value === 'afternoon'
}

/**
 * Días que se ofrecen para elegir: los siguientes, corridos.
 *
 * NO se salta sábado ni domingo. Quien acaba de perder su trabajo suele estar
 * disponible justo el fin de semana, y del otro lado esto no es una agenda que
 * bloquee huecos: es una preferencia que el abogado lee antes de marcar. Si el
 * despacho no atiende en sábado, el costo de que alguien lo pida es una llamada
 * el lunes — mucho menor que el de esconder los dos días en que más gente puede
 * contestar el teléfono.
 *
 * Arranca en MAÑANA, no en hoy: quien envía el formulario a las seis de la
 * tarde no puede elegir "hoy por la mañana", y ofrecer una franja que ya pasó
 * es la forma más rápida de que la primera llamada parezca incumplimiento.
 */
export function callDayOptions(from: PlainDate, count = 5): PlainDate[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i + 1))
}

export type ParseCallResult = { ok: true; data: CallPreference } | { ok: false; message: string }

/**
 * Valida la elección contra las MISMAS opciones que se ofrecieron.
 *
 * No basta con "es una fecha y es hábil": el cliente manda strings y podría
 * mandar un martes de dentro de ocho meses. Se comprueba pertenencia a la
 * lista, que es la única definición de "válido" que existe.
 */
export function parseCallPreference(
  rawDate: unknown,
  rawSlot: unknown,
  from: PlainDate,
  count = 5,
): ParseCallResult {
  if (typeof rawDate !== 'string' || !isPlainDate(rawDate)) {
    return { ok: false, message: 'Elige un día para la llamada.' }
  }
  if (!isCallSlot(rawSlot)) {
    return { ok: false, message: 'Elige si prefieres por la mañana o por la tarde.' }
  }
  const offered = callDayOptions(from, count)
  if (!offered.some((day) => compareDates(day, rawDate) === 0)) {
    return { ok: false, message: 'Ese día ya no está disponible. Elige uno de la lista.' }
  }
  return { ok: true, data: { date: rawDate, slot: rawSlot } }
}
