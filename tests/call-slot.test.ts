import { describe, expect, it } from 'vitest'
import { callDayOptions, parseCallPreference } from '@/lib/domain/call-slot'

/** 2026-08-24 es lunes; 2026-08-29 y 30, fin de semana. */
const LUNES = '2026-08-24'
const VIERNES = '2026-08-28'
const SABADO = '2026-08-29'

describe('franja para la llamada', () => {
  it('ofrece los días siguientes corridos, sin saltarse el fin de semana', () => {
    expect(callDayOptions(LUNES)).toEqual([
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29', // sábado: también se ofrece
    ])
  })

  it('desde viernes se puede pedir sábado y domingo', () => {
    expect(callDayOptions(VIERNES)).toEqual([
      '2026-08-29', // sábado
      '2026-08-30', // domingo
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('nunca ofrece hoy: quien envía a las seis de la tarde no puede pedir "hoy"', () => {
    expect(callDayOptions(LUNES)).not.toContain(LUNES)
  })

  it('acepta una elección que está entre las ofrecidas', () => {
    const result = parseCallPreference('2026-08-26', 'afternoon', LUNES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ date: '2026-08-26', slot: 'afternoon' })
  })

  it('rechaza un día que no se ofreció, aunque sea hábil', () => {
    // Hábil, futuro, pero fuera de la lista: el cliente manda strings.
    const result = parseCallPreference('2026-12-15', 'morning', LUNES)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/no está disponible/i)
  })

  it('acepta el fin de semana si está entre los días ofrecidos', () => {
    expect(parseCallPreference(SABADO, 'morning', LUNES).ok).toBe(true)
  })

  it('rechaza el propio día de hoy: la lista empieza mañana', () => {
    expect(parseCallPreference(LUNES, 'morning', LUNES).ok).toBe(false)
  })

  it('rechaza una franja inventada y una fecha que no es fecha', () => {
    expect(parseCallPreference('2026-08-26', 'madrugada', LUNES).ok).toBe(false)
    expect(parseCallPreference('mañana', 'morning', LUNES).ok).toBe(false)
    expect(parseCallPreference(null, 'morning', LUNES).ok).toBe(false)
  })
})
