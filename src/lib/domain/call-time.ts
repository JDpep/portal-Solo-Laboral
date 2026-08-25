/**
 * HORA SOLICITADA PARA LA LLAMADA.
 *
 * La persona elige día y HORA EXACTA, en pasos de diez minutos entre las 9:30
 * y las 17:30. Antes se pedía solo una franja (mañana/tarde) para no prometer
 * de más; el despacho decidió pasar a hora exacta porque una franja de cinco
 * horas obliga a quien espera la llamada a estar pendiente toda la mañana.
 *
 * Lo que NO cambia es que esto sigue siendo una PREFERENCIA, no una reserva
 * contra una agenda: el sistema no conoce la disponibilidad de los abogados y
 * no bloquea el hueco. Por eso el copy dice "haremos lo posible" y nunca
 * "tienes una cita". Ver `ScheduleCall`.
 *
 * Funciones puras y sin dependencias del navegador: se validan igual en el
 * servidor, que es donde manda.
 */
import { addDays, compareDates, isPlainDate } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'

/** "HH:MM" en 24 h. Siempre con dos dígitos, para que ordene como texto. */
export type CallTime = string

/** Extremos incluidos: 9:30 es la primera opción y 17:30 la última. */
export const CALL_TIME_FIRST_MINUTE = 9 * 60 + 30
export const CALL_TIME_LAST_MINUTE = 17 * 60 + 30
export const CALL_TIME_STEP_MINUTES = 10

function toClock(minutes: number): CallTime {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Todas las horas ofrecidas, en orden. Es la ÚNICA definición de "hora
 * válida": la pantalla la usa para pintar y el servidor para validar, así que
 * no pueden desincronizarse.
 */
export const CALL_TIMES: CallTime[] = Array.from(
  { length: (CALL_TIME_LAST_MINUTE - CALL_TIME_FIRST_MINUTE) / CALL_TIME_STEP_MINUTES + 1 },
  (_, i) => toClock(CALL_TIME_FIRST_MINUTE + i * CALL_TIME_STEP_MINUTES),
)

const CALL_TIME_SET = new Set(CALL_TIMES)

/**
 * Pertenencia a la lista, no "parece una hora". Un cliente puede mandar
 * "09:35" —hora real, dentro del rango, pero fuera de los pasos de diez— y eso
 * debe rechazarse igual que "madrugada".
 */
export function isCallTime(value: unknown): value is CallTime {
  return typeof value === 'string' && CALL_TIME_SET.has(value)
}

/** "9:30" para las pastillas: sin cero a la izquierda, que ahí estorba. */
export function callTimeLabel(time: CallTime): string {
  return time.replace(/^0/, '')
}

/** "9:30 h" para la prosa y para la tabla del portal. */
export function formatCallTime(time: CallTime): string {
  return `${callTimeLabel(time)} h`
}

/** Las horas agrupadas por hora en punto, para que el selector se lea. */
export function callTimesByHour(): { hour: number; times: CallTime[] }[] {
  const groups: { hour: number; times: CallTime[] }[] = []
  for (const time of CALL_TIMES) {
    const hour = Number(time.slice(0, 2))
    const last = groups[groups.length - 1]
    if (last && last.hour === hour) last.times.push(time)
    else groups.push({ hour, times: [time] })
  }
  return groups
}

export interface CallPreference {
  date: PlainDate
  time: CallTime
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
 * tarde no puede elegir "hoy a las 9:30", y ofrecer una hora que ya pasó es la
 * forma más rápida de que la primera llamada parezca incumplimiento.
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
  rawTime: unknown,
  from: PlainDate,
  count = 5,
): ParseCallResult {
  if (typeof rawDate !== 'string' || !isPlainDate(rawDate)) {
    return { ok: false, message: 'Elige un día para la llamada.' }
  }
  if (!isCallTime(rawTime)) {
    return { ok: false, message: 'Elige una hora de la lista.' }
  }
  const offered = callDayOptions(from, count)
  if (!offered.some((day) => compareDates(day, rawDate) === 0)) {
    return { ok: false, message: 'Ese día ya no está disponible. Elige uno de la lista.' }
  }
  return { ok: true, data: { date: rawDate, time: rawTime } }
}
