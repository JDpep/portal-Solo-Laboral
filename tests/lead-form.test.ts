import { describe, expect, it } from 'vitest'
import { EMPTY_LEAD_VALUES, LIMITS, parseLeadForm } from '@/lib/domain/lead-form'
import type { LeadFormValues } from '@/lib/domain/lead-form'

const HOY = '2026-08-21'

const VALIDO: LeadFormValues = {
  fullName: 'Juan Pérez Villanueva',
  phone: '55 1234 5678',
  state: 'CMX',
  dismissalDate: '2026-08-01',
  description: 'Trabajaba en un almacén y me despidieron sin darme nada.',
}

function parse(overrides: Partial<LeadFormValues> = {}) {
  return parseLeadForm({ ...VALIDO, ...overrides }, HOY)
}

describe('validación del formulario público', () => {
  it('acepta un envío completo y devuelve datos normalizados', () => {
    const result = parse()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.phone).toBe('5512345678') // guardado sin separadores
    expect(result.data.state).toBe('CMX')
    expect(result.data.dismissalDate).toBe('2026-08-01')
  })

  it('exige los cuatro campos obligatorios, y la descripción no es uno', () => {
    const result = parseLeadForm(EMPTY_LEAD_VALUES, HOY)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      'dismissalDate',
      'fullName',
      'phone',
      'state',
    ])
  })

  it('rechaza una fecha de despido futura con un error de formulario', () => {
    const result = parse({ dismissalDate: '2026-08-22' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.dismissalDate).toMatch(/no puede ser posterior/i)
  })

  it('acepta el día de hoy como fecha de despido', () => {
    expect(parse({ dismissalDate: HOY }).ok).toBe(true)
  })

  it('no acepta un estado inventado', () => {
    const result = parse({ state: 'ZZZ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.state).toBeDefined()
  })

  it('pide nombre y apellidos', () => {
    const result = parse({ fullName: 'Juan' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.fullName).toMatch(/apellidos/i)
  })

  it('recorta y limpia el texto en vez de confiar en el navegador', () => {
    const result = parse({
      fullName: '   Ana   María   Ruiz  ',
      description: 'Me corrieron.\n\n\n\n\nSin aviso   ni pago.',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.fullName).toBe('Ana María Ruiz')
    // Conserva el párrafo, colapsa la racha de saltos.
    expect(result.data.description).toBe('Me corrieron.\n\nSin aviso ni pago.')
  })

  it('aplica los topes de longitud del servidor', () => {
    const largo = 'a'.repeat(LIMITS.descriptionMax + 500)
    const result = parse({ fullName: `Ana ${'b'.repeat(300)}`, description: largo })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.fullName.length).toBe(LIMITS.nameMax)
    expect(result.data.description.length).toBe(LIMITS.descriptionMax)
  })

  it('acepta el envío sin descripción: el campo es opcional', () => {
    const result = parse({ description: '' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.description).toBe('')
  })

  it('no impone longitud mínima a la descripción', () => {
    const result = parse({ description: 'me corrieron' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.description).toBe('me corrieron')
  })
})
