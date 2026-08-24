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
