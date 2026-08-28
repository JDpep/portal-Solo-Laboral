import { describe, expect, it } from 'vitest'
import { addDays, addMonths, compareDates, daysBetween, formatDate, formatMonthLong, formatSubmittedAt, formatTime, instantFrom, isPlainDate, plainDateOf, startOfMonth, startOfWeek, today } from '@/lib/dates'

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

describe('fecha civil del despacho a instante real', () => {
  it('interpreta la hora elegida en la zona de Ciudad de México', () => {
    // La persona pidió "el 15 de septiembre a las 10:00" en México. En UTC son
    // las 16:00: sin esta conversión, un servidor en otra zona agendaría la
    // llamada a una hora distinta de la que se le prometió.
    expect(instantFrom('2026-09-15', '10:00')).toBe('2026-09-15T16:00:00.000Z')
  })

  it('no depende de la zona del servidor', () => {
    // Se pide explícitamente la zona: el resultado es el mismo se ejecute
    // donde se ejecute.
    expect(instantFrom('2026-09-15', '10:00', 'America/Mexico_City')).toBe(
      instantFrom('2026-09-15', '10:00'),
    )
    expect(instantFrom('2026-09-15', '10:00', 'UTC')).toBe('2026-09-15T10:00:00.000Z')
  })

  it('la hora que se guarda vuelve a leerse igual en la zona del despacho', () => {
    const instant = instantFrom('2026-12-31', '17:30')
    expect(formatTime(instant)).toBe('17:30')
    expect(plainDateOf(instant)).toBe('2026-12-31')
  })
})

/**
 * La semana de la agenda.
 *
 * Empieza en LUNES. Arrancarla en domingo partiría el fin de semana entre dos
 * pantallas, y el despacho sí agenda llamadas en sábado.
 */
describe('semana del despacho', () => {
  it('devuelve el lunes de la semana de cualquier día', () => {
    // 2026-08-24 es lunes; del lunes al domingo siguiente todos caen en él.
    expect(startOfWeek('2026-08-24')).toBe('2026-08-24')
    expect(startOfWeek('2026-08-27')).toBe('2026-08-24')
    expect(startOfWeek('2026-08-30')).toBe('2026-08-24') // domingo
    expect(startOfWeek('2026-08-31')).toBe('2026-08-31') // ya es otra semana
  })

  it('el domingo pertenece a la semana que termina, no a la que empieza', () => {
    // Es el caso que un `-weekday` ingenuo se salta: domingo = 0 y lo mandaría
    // al lunes SIGUIENTE, escondiendo lo agendado ese día.
    expect(startOfWeek('2026-08-30')).toBe('2026-08-24')
    expect(daysBetween(startOfWeek('2026-08-30'), '2026-08-30')).toBe(6)
  })

  it('cruza el cambio de mes y de año sin perder el lunes', () => {
    expect(startOfWeek('2026-03-01')).toBe('2026-02-23')
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
    expect(startOfWeek('2024-03-01')).toBe('2024-02-26') // año bisiesto
  })

  it('siete días desde el lunes caen en el lunes siguiente', () => {
    // Es la aritmética del rango semiabierto de la agenda: [lunes, lunes+7).
    for (const dia of ['2026-08-24', '2026-12-28', '2024-02-26']) {
      expect(startOfWeek(addDays(dia, 7))).toBe(addDays(dia, 7))
    }
  })

  it('nombra el mes en español', () => {
    expect(formatMonthLong('2026-08-24')).toBe('agosto de 2026')
    expect(formatMonthLong('2026-01-01')).toBe('enero de 2026')
  })
})

/** La rejilla del calendario se mueve de mes en mes; aquí está su aritmética. */
describe('meses del calendario', () => {
  it('encuentra el día 1 del mes', () => {
    expect(startOfMonth('2026-08-28')).toBe('2026-08-01')
    expect(startOfMonth('2026-08-01')).toBe('2026-08-01')
  })

  it('avanza y retrocede meses cruzando el año', () => {
    expect(addMonths('2026-08-01', 1)).toBe('2026-09-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(addMonths('2026-08-01', -14)).toBe('2025-06-01')
  })

  it('recorta el día al último del mes destino', () => {
    // Sin el recorte, el 31 de enero más un mes daría el 3 de marzo y pulsar
    // "mes siguiente" desde ahí se saltaría febrero entero.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29') // bisiesto
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('doce saltos de un mes dan la vuelta al año', () => {
    let fecha = '2026-08-01'
    for (let i = 0; i < 12; i += 1) fecha = addMonths(fecha, 1)
    expect(fecha).toBe('2027-08-01')
  })

  it('la rejilla de un mes son semanas completas de lunes a domingo', () => {
    // Es como la arma la pantalla: del lunes de la semana del día 1 al domingo
    // de la semana del último día. Siempre múltiplo de 7, sin celdas huérfanas.
    for (const mes of ['2026-02-01', '2026-08-01', '2027-01-01', '2024-02-01']) {
      const desde = startOfWeek(mes)
      const ultimo = addDays(addMonths(mes, 1), -1)
      const hasta = addDays(startOfWeek(ultimo), 7)
      const celdas = daysBetween(desde, hasta)
      expect(celdas % 7).toBe(0)
      expect(celdas).toBeGreaterThanOrEqual(28)
      // Y el mes entero cabe dentro de la rejilla.
      expect(desde <= mes).toBe(true)
      expect(hasta > ultimo).toBe(true)
    }
  })
})
