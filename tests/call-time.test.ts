import { describe, expect, it } from 'vitest'
import {
  CALL_TIMES,
  callDayOptions,
  callTimeLabel,
  callTimesByHour,
  formatCallTime,
  isCallTime,
  parseCallPreference,
} from '@/lib/domain/call-time'

/** 2026-08-24 es lunes; 2026-08-29 y 30, fin de semana. */
const LUNES = '2026-08-24'
const VIERNES = '2026-08-28'
const SABADO = '2026-08-29'

describe('horas ofrecidas para la llamada', () => {
  it('van de 9:30 a 17:30 de diez en diez, con los extremos incluidos', () => {
    expect(CALL_TIMES[0]).toBe('09:30')
    expect(CALL_TIMES[CALL_TIMES.length - 1]).toBe('17:30')
    // Ocho horas de 9:30 a 17:30 = 480 min; 48 pasos + la hora inicial.
    expect(CALL_TIMES).toHaveLength(49)
  })

  it('no deja huecos ni repite: cada paso es de diez minutos', () => {
    const minutes = CALL_TIMES.map((t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    })
    const steps = minutes.slice(1).map((m, i) => m - minutes[i])
    expect(new Set(steps)).toEqual(new Set([10]))
    expect(new Set(CALL_TIMES).size).toBe(CALL_TIMES.length)
  })

  it('todas llevan dos dígitos, para que ordenen como texto', () => {
    expect(CALL_TIMES.every((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true)
    expect([...CALL_TIMES].sort()).toEqual(CALL_TIMES)
  })

  it('nunca ofrece nada antes de 9:30 ni después de 17:30', () => {
    expect(isCallTime('09:20')).toBe(false)
    expect(isCallTime('17:40')).toBe(false)
    expect(isCallTime('08:00')).toBe(false)
    expect(isCallTime('19:00')).toBe(false)
  })

  it('rechaza una hora real que no cae en el paso de diez', () => {
    // Está dentro del rango y es una hora legítima, pero no se ofreció.
    expect(isCallTime('09:35')).toBe(false)
    expect(isCallTime('14:07')).toBe(false)
  })

  it('rechaza cualquier cosa que no sea una de las horas', () => {
    expect(isCallTime('morning')).toBe(false)
    expect(isCallTime('9:30')).toBe(false) // sin cero a la izquierda
    expect(isCallTime(null)).toBe(false)
    expect(isCallTime(930)).toBe(false)
  })

  it('se agrupan por hora en punto sin perder ninguna', () => {
    const groups = callTimesByHour()
    expect(groups.map((g) => g.hour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(groups.flatMap((g) => g.times)).toEqual(CALL_TIMES)
    // La primera y la última hora están recortadas por los extremos.
    expect(groups[0].times).toEqual(['09:30', '09:40', '09:50'])
    expect(groups[8].times).toEqual(['17:00', '17:10', '17:20', '17:30'])
  })

  it('se muestran sin cero a la izquierda', () => {
    expect(callTimeLabel('09:30')).toBe('9:30')
    expect(callTimeLabel('17:30')).toBe('17:30')
    expect(formatCallTime('09:40')).toBe('9:40 h')
  })
})

describe('día para la llamada', () => {
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
})

describe('validación de la elección', () => {
  it('acepta una elección que está entre las ofrecidas', () => {
    const result = parseCallPreference('2026-08-26', '16:20', LUNES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ date: '2026-08-26', time: '16:20' })
  })

  it('rechaza un día que no se ofreció, aunque sea hábil', () => {
    // Hábil, futuro, pero fuera de la lista: el cliente manda strings.
    const result = parseCallPreference('2026-12-15', '10:00', LUNES)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/no está disponible/i)
  })

  it('acepta el fin de semana si está entre los días ofrecidos', () => {
    expect(parseCallPreference(SABADO, '10:00', LUNES).ok).toBe(true)
  })

  it('rechaza el propio día de hoy: la lista empieza mañana', () => {
    expect(parseCallPreference(LUNES, '10:00', LUNES).ok).toBe(false)
  })

  it('rechaza una hora inventada y una fecha que no es fecha', () => {
    expect(parseCallPreference('2026-08-26', '09:35', LUNES).ok).toBe(false)
    expect(parseCallPreference('2026-08-26', 'afternoon', LUNES).ok).toBe(false)
    expect(parseCallPreference('mañana', '10:00', LUNES).ok).toBe(false)
    expect(parseCallPreference(null, '10:00', LUNES).ok).toBe(false)
  })

  it('el mensaje de la hora inválida manda a la lista, no culpa a la persona', () => {
    const result = parseCallPreference('2026-08-26', '03:00', LUNES)
    if (result.ok) throw new Error('debía fallar')
    expect(result.message).toMatch(/hora de la lista/i)
  })
})
