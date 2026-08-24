import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La server action completa, con sus defensas.
 *
 * `next/headers` solo existe dentro de una petición de Next, así que se
 * sustituye por un doble que devuelve la IP que cada caso necesita — es lo
 * único que la acción le pide.
 */
let ip = '187.190.0.1'

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? ip : null),
  }),
  cookies: () => ({ get: () => undefined, set: () => undefined }),
}))

const { submitLeadAction } = await import('@/app/solicitud/actions')
const { HONEYPOT_FIELD } = await import('@/lib/domain/lead-submission')
const { resetStore } = await import('@/lib/db/store')
const { ensureSeeded } = await import('@/lib/db')
const { countLeadsByStatus, listQualifiedLeads } = await import('@/lib/db/leads')
const { LEAD_POLICY } = await import('@/lib/auth/rate-limit')
const { resetRateLimits } = await import('@/lib/auth/rate-limit')
const { addDays, today } = await import('@/lib/dates')

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  const values: Record<string, string> = {
    fullName: 'Juan Pérez Villanueva',
    phone: '55 1234 5678',
    state: 'CMX',
    dismissalDate: addDays(today(), -20),
    description: 'Trabajaba en un almacén y me despidieron sin liquidación.',
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const IDLE = { status: 'idle' } as const

beforeEach(async () => {
  resetStore()
  resetRateLimits()
  ip = '187.190.0.1'
  // La acción siembra al arrancar; se hace aquí para que los conteos previos
  // de cada caso ya incluyan la semilla y midan solo lo que el caso agrega.
  await ensureSeeded()
})

describe('recepción del formulario público', () => {
  it('un envío calificado responde con folio y queda visible para los abogados', async () => {
    const state = await submitLeadAction(IDLE, form())
    expect(state.status).toBe('qualified')
    if (state.status !== 'qualified') return
    expect(state.caseNumber).toMatch(/^SL-\d{6}$/)

    // La semilla trae tres calificados de demostración; este es el cuarto.
    const page = await listQualifiedLeads()
    expect(page.rows[0].caseNumber).toBe(state.caseNumber)
    // Un envío real nunca queda marcado como dato sembrado.
    expect(page.rows[0].isDemo).toBe(false)
    expect(page.rows.filter((l) => l.isDemo)).toHaveLength(3)
  })

  it('un envío no calificado responde sin folio y no llega al portal', async () => {
    const antes = (await listQualifiedLeads()).total
    const state = await submitLeadAction(IDLE, form({ state: 'CAM', phone: '9811457023' }))
    expect(state.status).toBe('unqualified')
    expect((await listQualifiedLeads()).total).toBe(antes)
  })

  /**
   * El motivo es lo que decide QUÉ texto lee la persona en la pantalla del no.
   * Si la acción devolviera el motivo equivocado, alguien de la Ciudad de
   * México leería que está fuera de cobertura. Por eso se prueba cada rama.
   */
  it('devuelve el motivo por el que no calificó, para poder decírselo', async () => {
    const fuera = await submitLeadAction(IDLE, form({ state: 'CAM', phone: '9811457023' }))
    expect(fuera).toEqual({ status: 'unqualified', reason: 'unqualified_state' })

    const tarde = await submitLeadAction(
      IDLE,
      form({ dismissalDate: addDays(today(), -60), phone: '5544332211' }),
    )
    expect(tarde).toEqual({ status: 'unqualified', reason: 'unqualified_dismissal_date' })

    const ambas = await submitLeadAction(
      IDLE,
      form({ state: 'CAM', dismissalDate: addDays(today(), -200), phone: '9812223344' }),
    )
    expect(ambas).toEqual({
      status: 'unqualified',
      reason: 'unqualified_state_and_dismissal_date',
    })
  })

  it('el reenvío repetido repite el mismo motivo, no uno genérico', async () => {
    const campos = { state: 'CAM', phone: '9811457023' }
    const primero = await submitLeadAction(IDLE, form(campos))
    const segundo = await submitLeadAction(IDLE, form(campos))
    expect(segundo).toEqual(primero)
    expect(segundo).toEqual({ status: 'unqualified', reason: 'unqualified_state' })
  })

  it('devuelve errores por campo sin perder lo que la persona ya escribió', async () => {
    const state = await submitLeadAction(IDLE, form({ phone: '123', state: '' }))
    expect(state.status).toBe('invalid')
    if (state.status !== 'invalid') return
    expect(state.fieldErrors.phone).toBeDefined()
    expect(state.fieldErrors.state).toBeDefined()
    // La descripción es opcional: nunca aporta un error de campo.
    expect(state.fieldErrors.description).toBeUndefined()
    expect(state.values.fullName).toBe('Juan Pérez Villanueva')
  })

  it('rechaza una fecha de despido futura', async () => {
    const state = await submitLeadAction(IDLE, form({ dismissalDate: addDays(today(), 1) }))
    expect(state.status).toBe('invalid')
    if (state.status !== 'invalid') return
    expect(state.fieldErrors.dismissalDate).toMatch(/posterior/i)
  })

  it('la trampa de bots descarta el envío sin guardar nada', async () => {
    const antes = await countLeadsByStatus()
    const data = form()
    data.set(HONEYPOT_FIELD, 'https://spam.example')
    const state = await submitLeadAction(IDLE, data)

    expect(state.status).toBe('blocked')
    expect(await countLeadsByStatus()).toEqual(antes)
  })

  it('el reenvío del mismo caso no crea un segundo registro', async () => {
    const primero = await submitLeadAction(IDLE, form())
    const segundo = await submitLeadAction(IDLE, form())
    expect(segundo).toEqual(primero)

    const folios = (await listQualifiedLeads()).rows.map((l) => l.caseNumber)
    expect(new Set(folios).size).toBe(folios.length)
  })

  it('corta a la misma IP tras el límite, y otra IP no se ve afectada', async () => {
    // Envíos distintos entre sí, para que el corte sea el límite y no el duplicado.
    for (let i = 0; i < LEAD_POLICY.limit; i++) {
      const state = await submitLeadAction(
        IDLE,
        form({ dismissalDate: addDays(today(), -(i + 1)) }),
      )
      expect(state.status).not.toBe('blocked')
    }

    const cortado = await submitLeadAction(IDLE, form({ dismissalDate: addDays(today(), -30) }))
    expect(cortado.status).toBe('blocked')

    ip = '201.140.0.9'
    const otro = await submitLeadAction(IDLE, form({ dismissalDate: addDays(today(), -30) }))
    expect(otro.status).toBe('qualified')
  })
})
