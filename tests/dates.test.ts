import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareDates,
  daysBetween,
  formatDate,
  formatSubmittedAt,
  isPlainDate,
  plainDateOf,
  today,
} from '@/lib/dates'

describe('fechas civiles', () => {
  it('valida fechas civiles', () => {
    expect(isPlainDate('2024-02-29')).toBe(true) // 2024 es bisiesto
    expect(isPlainDate('2026-02-29')).toBe(false)
    expect(isPlainDate('2026-13-01')).toBe(false)
    expect(isPlainDate('21/08/2026')).toBe(false)
    expect(isPlainDate('')).toBe(false)
  })

  it('muestra DD/MM/YYYY sin correrse por zona horaria', () => {
    expect(formatDate('2026-03-09')).toBe('09/03/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })

  it('compara y resta días', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareDates('2026-01-02', '2026-01-02')).toBe(0)
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // 2024 bisiesto
  })

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-08-21', -60)).toBe('2026-06-22')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('resuelve la fecha civil en la zona del despacho, no en la del servidor', () => {
    // 21 de agosto 03:00 UTC son todavía las 21:00 del 20 en Ciudad de México.
    expect(plainDateOf('2026-08-21T03:00:00.000Z')).toBe('2026-08-20')
    expect(plainDateOf('2026-08-21T13:00:00.000Z')).toBe('2026-08-21')
    expect(isPlainDate(today())).toBe(true)
  })

  it('escribe "Hoy" y "Ayer" contra una fecha de referencia explícita', () => {
    expect(formatSubmittedAt('2026-08-21T15:32:00.000Z', '2026-08-21')).toBe('Hoy · 09:32')
    expect(formatSubmittedAt('2026-08-20T15:32:00.000Z', '2026-08-21')).toBe('Ayer · 09:32')
    expect(formatSubmittedAt('2026-08-19T15:32:00.000Z', '2026-08-21')).toBe('19/08/2026 · 09:32')
  })
})
