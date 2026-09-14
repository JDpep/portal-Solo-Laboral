import { describe, expect, it } from 'vitest'
import {
  breakdown,
  DEFAULT_FEE_RATE_BP,
  feeCents,
  formatMoney,
  formatRate,
  parseMoneyToCents,
  parseRateToBp,
  safeFileName,
  sniffFileType,
} from '@/lib/domain/convenio'

describe('honorarios de Solo Laboral', () => {
  it('cobra 35 % por omisión sobre lo acordado con el patrón', () => {
    expect(DEFAULT_FEE_RATE_BP).toBe(3500)
    // $100,000.00 acordados → $35,000.00 de honorarios, $65,000.00 al trabajador
    expect(breakdown(10_000_000, 3500)).toEqual({
      agreedCents: 10_000_000,
      rateBp: 3500,
      feeCents: 3_500_000,
      clientNetCents: 6_500_000,
    })
  })

  it('redondea al centavo, mitad hacia arriba (igual que la columna de la base)', () => {
    // 35 % de $0.01 = 0.35 centavos → 0
    expect(feeCents(1, 3500)).toBe(0)
    // 35 % de $0.10 = 3.5 centavos → 4
    expect(feeCents(10, 3500)).toBe(4)
    // 35 % de $123,456.78 = 4,320,987.3 centavos → 4,320,987
    expect(feeCents(12_345_678, 3500)).toBe(4_320_987)
  })

  it('las tres cifras siempre cuadran', () => {
    for (const agreed of [1, 99, 12_345_678, 987_654_321, 10_000_000_000_000]) {
      for (const rate of [0, 1, 2500, 3333, 3500, 10_000]) {
        const b = breakdown(agreed, rate)
        expect(b.feeCents + b.clientNetCents).toBe(agreed)
      }
    }
  })

  it('no pierde precisión en el tope', () => {
    expect(feeCents(10_000_000_000_000, 3500)).toBe(3_500_000_000_000)
  })
})

describe('captura de montos', () => {
  it('acepta como se escribe un monto en México', () => {
    expect(parseMoneyToCents('150000')).toBe(15_000_000)
    expect(parseMoneyToCents('$150,000.50')).toBe(15_000_050)
    expect(parseMoneyToCents('150 000.5')).toBe(15_000_050)
    expect(parseMoneyToCents('  $ 1,500 ')).toBe(150_000)
  })

  it('rechaza lo que no es un monto', () => {
    for (const bad of ['', '0', '-100', 'abc', '1.234', '1,5.00.0', '$']) {
      expect(parseMoneyToCents(bad)).toBeNull()
    }
  })

  it('porcentaje en puntos base', () => {
    expect(parseRateToBp('35')).toBe(3500)
    expect(parseRateToBp('35.5 %')).toBe(3550)
    expect(parseRateToBp('0')).toBe(0)
    expect(parseRateToBp('100')).toBe(10_000)
    expect(parseRateToBp('101')).toBeNull()
    expect(parseRateToBp('-5')).toBeNull()
    expect(parseRateToBp('treinta')).toBeNull()
  })

  it('formatea en pesos', () => {
    expect(formatMoney(15_000_050)).toBe('$150,000.50')
    expect(formatRate(3500)).toBe('35 %')
    expect(formatRate(3550)).toBe('35.5 %')
  })
})

describe('documentos', () => {
  it('reconoce el archivo por su firma, no por su nombre', () => {
    expect(sniffFileType(new TextEncoder().encode('%PDF-1.7 ...'))).toBe('application/pdf')
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    )
    expect(sniffFileType(new TextEncoder().encode('MZ ejecutable'))).toBeNull()
  })

  it('limpia el nombre para la cabecera', () => {
    expect(safeFileName('C:\\docs\\convenio "firmado".pdf')).toBe('convenio firmado.pdf')
    expect(safeFileName('')).toBe('convenio')
  })
})
