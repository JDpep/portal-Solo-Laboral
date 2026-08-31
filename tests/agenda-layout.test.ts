import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  draftRange,
  layoutDay,
  snapDown,
  snapUp,
  spanOf,
} from '@/lib/agenda/layout'
import {
  formatWeekRange,
  minutesFromTime,
  minutesOfDay,
  timeFromMinutes,
  weekdayShort,
} from '@/lib/dates'

const span = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin })

describe('rejilla por horas', () => {
  it('coloca en una sola columna lo que no se traslapa', () => {
    const placed = layoutDay([span('a', 540, 600), span('b', 600, 660)])
    expect(placed.map((p) => [p.id, p.column, p.columns])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  it('parte el ancho entre las citas que caen a la misma hora', () => {
    const placed = layoutDay([span('a', 540, 660), span('b', 570, 630), span('c', 600, 700)])
    expect(placed.map((p) => p.columns)).toEqual([3, 3, 3])
    expect(placed.map((p) => p.column)).toEqual([0, 1, 2])
  })

  it('da el mismo ancho a todo el racimo, aunque dos de sus citas no se toquen', () => {
    // 'c' no se traslapa con 'a', pero 'b' las encadena: si 'c' decidiera su
    // ancho mirando solo a 'a', quedaría más ancha y el racimo saldría desparejo.
    const placed = layoutDay([span('a', 540, 600), span('b', 570, 690), span('c', 630, 700)])
    expect(placed.every((p) => p.columns === 2)).toBe(true)
    expect(placed.find((p) => p.id === 'c')?.column).toBe(0)
  })

  it('cierra el racimo cuando queda un hueco y devuelve el ancho completo', () => {
    const placed = layoutDay([span('a', 540, 600), span('b', 545, 600), span('c', 700, 760)])
    expect(placed.find((p) => p.id === 'c')?.columns).toBe(1)
  })

  it('cuenta como traslape una actividad de duración cero', () => {
    const placed = layoutDay([span('a', 540, 540), span('b', 540, 600)])
    expect(placed.every((p) => p.columns === 2)).toBe(true)
  })

  it('ordena por hora aunque lleguen desordenadas', () => {
    const placed = layoutDay([span('tarde', 900, 960), span('temprano', 480, 540)])
    expect(placed.map((p) => p.id)).toEqual(['temprano', 'tarde'])
  })
})

describe('alto de un bloque', () => {
  it('da alto mínimo a lo que no tiene hora de fin', () => {
    expect(spanOf(600, null)).toEqual({ startMin: 600, endMin: 600 + MIN_DURATION_MINUTES })
  })

  it('estira lo que dura menos del mínimo legible', () => {
    expect(spanOf(600, 605).endMin).toBe(600 + MIN_DURATION_MINUTES)
  })

  it('corta en la medianoche lo que se pasaría del día', () => {
    expect(spanOf(1400, 1600).endMin).toBe(1440)
  })
})

describe('gesto sobre la rejilla', () => {
  it('un clic seco agenda una hora', () => {
    expect(draftRange(607, 607)).toEqual({ startMin: 600, endMin: 600 + DEFAULT_DURATION_MINUTES })
  })

  it('el arrastre respeta el tramo recorrido, enganchado a 15 minutos', () => {
    expect(draftRange(602, 731)).toEqual({ startMin: 600, endMin: 735 })
  })

  it('arrastrar hacia arriba vale igual que hacia abajo', () => {
    expect(draftRange(731, 602)).toEqual(draftRange(602, 731))
  })

  it('no deja que el tramo se salga del día', () => {
    const range = draftRange(1439, 1439)
    expect(range.endMin).toBeLessThanOrEqual(1440)
    expect(range.endMin - range.startMin).toBeGreaterThanOrEqual(MIN_DURATION_MINUTES)
  })

  it('engancha hacia abajo el inicio y hacia arriba el fin', () => {
    expect(snapDown(607)).toBe(600)
    expect(snapUp(607)).toBe(615)
    expect(snapDown(600)).toBe(600)
    expect(snapUp(600)).toBe(600)
  })
})

describe('horas y semanas para la pantalla', () => {
  it('lee la hora del despacho, no la del servidor', () => {
    // 13:30 UTC son las 7:30 en Ciudad de México.
    expect(minutesOfDay('2026-08-31T13:30:00.000Z')).toBe(7 * 60 + 30)
    expect(minutesOfDay('2026-08-31T06:00:00.000Z')).toBe(0)
  })

  it('convierte minutos a la hora que entiende un campo de tiempo, y de vuelta', () => {
    expect(timeFromMinutes(450)).toBe('07:30')
    expect(timeFromMinutes(0)).toBe('00:00')
    expect(minutesFromTime('07:30')).toBe(450)
    expect(minutesFromTime(timeFromMinutes(1234))).toBe(1234)
  })

  it('nombra el día de la semana sin punto', () => {
    expect(weekdayShort('2026-08-31')).toBe('lun')
    expect(weekdayShort('2026-09-06')).toBe('dom')
  })

  it('recorta del título de la semana lo que se repite', () => {
    expect(formatWeekRange('2026-08-24')).toBe('24 – 30 de agosto de 2026')
    expect(formatWeekRange('2026-08-31')).toBe('31 de agosto – 6 de septiembre de 2026')
    expect(formatWeekRange('2026-12-28')).toBe('28 de diciembre de 2026 – 3 de enero de 2027')
  })
})
