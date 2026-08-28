/**
 * Fechas.
 *
 * La FECHA DE DESPIDO es una fecha civil sin hora: "me corrieron el 1 de
 * agosto" no depende de la zona horaria de quien lo lea. Se maneja como
 * `PlainDate` = "YYYY-MM-DD" y jamás se convierte a Date/UTC, porque esa
 * conversión corre la fecha un día según la zona del servidor — y con un
 * límite de exactamente 60 días, un día de más decide si un caso entra o no.
 *
 * Solo el sello de envío es un instante real (ISO UTC).
 */

/** "YYYY-MM-DD" — fecha civil sin hora ni zona. */
export type PlainDate = string

/** Zona del despacho. Toda fecha "de hoy" se resuelve aquí, no en el servidor. */
export const FIRM_TIME_ZONE = 'America/Mexico_City'

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'string') return false
  const m = value.match(PLAIN_DATE_RE)
  if (!m) return false
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1]
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** "2026-03-09" -> "09/03/2026" */
export function formatDate(value: PlainDate | null | undefined): string {
  if (!value || !isPlainDate(value)) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/** Comparación lexicográfica: válida para ISO YYYY-MM-DD. */
export function compareDates(a: PlainDate, b: PlainDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Días completos entre dos fechas civiles (b − a). Sin DST de por medio. */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return Math.round((toEpochDay(b) - toEpochDay(a)) / 86_400_000)
}

function toEpochDay(value: PlainDate): number {
  const [y, m, d] = value.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Suma (o resta, con delta negativo) días civiles. */
export function addDays(value: PlainDate, delta: number): PlainDate {
  const next = new Date(toEpochDay(value) + delta * 86_400_000)
  const y = next.getUTCFullYear()
  const m = next.getUTCMonth() + 1
  const d = next.getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * El lunes de la semana a la que pertenece una fecha.
 *
 * Lunes y no domingo: la semana del despacho es laboral, y arrancarla en
 * domingo parte el fin de semana en dos pantallas distintas.
 */
export function startOfWeek(value: PlainDate): PlainDate {
  const weekday = new Date(toEpochDay(value)).getUTCDay() // 0 = domingo
  return addDays(value, weekday === 0 ? -6 : 1 - weekday)
}

/** El día 1 del mes al que pertenece la fecha. */
export function startOfMonth(value: PlainDate): PlainDate {
  return `${value.slice(0, 7)}-01`
}

/**
 * Suma (o resta) meses civiles.
 *
 * Recorta el día al último del mes destino: el 31 de enero más un mes es el 28
 * de febrero, no el 3 de marzo. Sin ese recorte, pulsar "mes siguiente" tres
 * veces desde el 31 de enero se saltaría marzo entero.
 */
export function addMonths(value: PlainDate, delta: number): PlainDate {
  const [year, month, day] = value.split('-').map(Number)
  const total = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

/** "agosto de 2026" — para el encabezado de un rango. */
export function formatMonthLong(value: PlainDate): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(toEpochDay(value)))
}

/** Fecha civil de hoy en la zona del despacho. */
export function today(timeZone = FIRM_TIME_ZONE): PlainDate {
  // en-CA formatea como YYYY-MM-DD, que es exactamente PlainDate.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Fecha civil, en la zona del despacho, de un instante ISO. */
export function plainDateOf(iso: string, timeZone = FIRM_TIME_ZONE): PlainDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/**
 * "martes 26 de agosto".
 *
 * Se formatea en UTC a propósito: `PlainDate` es una fecha civil sin hora, y
 * pasarla por la zona del despacho la correría un día en cuanto el servidor
 * viviera al oeste de México.
 */
export function formatDateLong(value: PlainDate | null | undefined): string {
  if (!value || !isPlainDate(value)) return '—'
  // Intl devuelve "miércoles, 26 de agosto"; la coma sobra dentro de una
  // frase como "te llamaremos el miércoles 26 de agosto, por la tarde".
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date(toEpochDay(value)))
    .replace(',', '')
}

/** "mar 26 ago" — para las pastillas de día, donde el ancho es el problema. */
export function formatDateChip(value: PlainDate): string {
  const d = new Date(toEpochDay(value))
  const weekdayName = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short' })
    .format(d)
    .replace('.', '')
  const dayMonth = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })
    .format(d)
    .replace('.', '')
  return `${weekdayName} ${dayMonth}`
}

/**
 * Fecha civil + hora del despacho -> instante real (ISO UTC).
 *
 * Hace falta porque las dos mitades del sistema hablan idiomas distintos: la
 * persona elige "el jueves a las 16:20" —que no es un instante hasta que se le
 * pega una zona— y el calendario guarda `timestamptz`, que sí lo es. Componer
 * la cadena a mano y pasarla por `new Date()` la interpretaría en la zona del
 * SERVIDOR, y una audiencia agendada desde un servidor en Virginia saldría dos
 * horas corrida en la agenda del abogado.
 *
 * Se resuelve preguntándole a Intl cuánto vale el desfase de la zona EN ESE
 * instante, no hoy: así un horario de verano —que México ya no aplica, pero la
 * función no tiene por qué saberlo— no descuadra nada.
 */
export function instantFrom(
  date: PlainDate,
  time: string,
  timeZone = FIRM_TIME_ZONE,
): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)

  // Dos pasadas: la primera aproxima el desfase con el instante ingenuo; la
  // segunda lo corrige si esa aproximación cayó al otro lado de un cambio de
  // horario. Con dos basta para cualquier zona real.
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone)
  instant = naive - zoneOffsetMs(new Date(instant), timeZone)
  return new Date(instant).toISOString()
}

/** Cuánto adelanta (o atrasa) la zona respecto de UTC en ese instante. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // Algunas versiones de ICU formatean la medianoche como "24".
    read('hour') % 24,
    read('minute'),
    read('second'),
  )
  return asUtc - instant.getTime()
}

/** Instante real, para sellos de envío y sesiones. */
export function nowIso(): string {
  return new Date().toISOString()
}

/** "09:32" en hora de Ciudad de México. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: FIRM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** "09/03/2026 · 14:32" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatDate(plainDateOf(iso))} · ${formatTime(iso)}`
}

/**
 * "Hoy · 09:32" / "Ayer · 14:05" / "19/08/2026 · 09:32".
 *
 * El abogado escanea la tabla para decidir a quién llama primero: "Hoy" se lee
 * más rápido que una fecha completa. `reference` se pasa explícito para que la
 * función sea probable sin congelar el reloj.
 */
export function formatSubmittedAt(iso: string, reference: PlainDate = today()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = plainDateOf(iso)
  const delta = daysBetween(day, reference)
  const time = formatTime(iso)
  if (delta === 0) return `Hoy · ${time}`
  if (delta === 1) return `Ayer · ${time}`
  return `${formatDate(day)} · ${time}`
}
