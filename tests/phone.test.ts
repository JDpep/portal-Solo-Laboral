import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, telHref, whatsappHref } from '@/lib/domain/phone'

describe('teléfono mexicano', () => {
  it('acepta lo que la gente escribe de verdad', () => {
    const esperado = '5512345678'
    for (const entrada of [
      '5512345678',
      '55 1234 5678',
      '55-1234-5678',
      '(55) 1234 5678',
      '+52 55 1234 5678',
      '+521 55 1234 5678',
      '5215512345678',
      '044 55 1234 5678',
      '  55 1234 5678  ',
    ]) {
      expect(normalizePhone(entrada), entrada).toBe(esperado)
    }
  })

  it('rechaza lo que no es marcable', () => {
    expect(normalizePhone('551234567')).toBeNull() // 9 dígitos
    expect(normalizePhone('55123456789')).toBeNull() // 11 sin prefijo válido
    expect(normalizePhone('0512345678')).toBeNull() // no hay lada que empiece en 0
    expect(normalizePhone('1512345678')).toBeNull() // ni en 1
    expect(normalizePhone('no soy un teléfono')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })

  it('agrupa según la lada tenga dos o tres dígitos', () => {
    expect(formatPhone('5512345678')).toBe('55 1234 5678')
    expect(formatPhone('8112345678')).toBe('81 1234 5678')
    expect(formatPhone('4771234567')).toBe('477 123 4567')
    expect(formatPhone(null)).toBe('—')
  })

  it('arma enlaces con lada de país', () => {
    expect(telHref('5512345678')).toBe('tel:+525512345678')
    expect(whatsappHref('5512345678')).toBe('https://wa.me/525512345678')
  })
})
