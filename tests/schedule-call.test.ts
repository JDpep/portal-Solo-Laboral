import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Agendar la llamada, con su autorización real.
 *
 * El doble de `next/headers` lleva un tarro de galletas DE VERDAD: lo que se
 * prueba aquí no es el formato de la fecha (eso está en call-slot.test.ts) sino
 * que el permiso para agendar viaje en una cookie firmada y que sin ella no se
 * pueda tocar ninguna solicitud.
 */
const jar = new Map<string, string>()
let ip = '187.190.0.1'

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? ip : null),
  }),
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value)
    },
  }),
}))

const { submitLeadAction, scheduleCallAction } = await import('@/app/solicitud/actions')
const { resetStore } = await import('@/lib/db/store')
const { listQualifiedLeads } = await import('@/lib/db/leads')
const { resetRateLimits } = await import('@/lib/auth/rate-limit')
const { addDays, today } = await import('@/lib/dates')
const { callDayOptions } = await import('@/lib/domain/call-slot')

const IDLE = { status: 'idle' } as const
const SCHEDULE_IDLE = { status: 'idle' } as const

/**
 * El caso de la prueba, buscado por nombre y NO por `rows[0]`.
 *
 * La semilla siembra un demo que ya trae franja pedida, y todos los registros
 * nacen en el mismo milisegundo: ordenar por fecha de envío deja el primer
 * lugar al azar. Atarse a la posición hacía que estas pruebas afirmaran cosas
 * sobre el registro equivocado. El nombre además NO puede repetir ninguno de
 * la semilla, o la búsqueda devuelve dos.
 */
async function casoDePrueba() {
  const page = await listQualifiedLeads({ query: 'Ana Ruiz Delgado' })
  return page.rows[0]
}

function leadForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  const values: Record<string, string> = {
    fullName: 'Ana Ruiz Delgado',
    phone: '55 1234 5678',
    state: 'CMX',
    dismissalDate: addDays(today(), -20),
    description: 'Me despidieron sin liquidación.',
    ...overrides,
  }
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

function scheduleForm(date: string, slot: string): FormData {
  const data = new FormData()
  data.set('callDate', date)
  data.set('callSlot', slot)
  return data
}

beforeEach(() => {
  jar.clear()
  resetStore()
  resetRateLimits()
  ip = '187.190.0.1'
})

describe('agendar la llamada', () => {
  it('un caso calificado puede elegir franja y queda guardada', async () => {
    const submitted = await submitLeadAction(IDLE, leadForm())
    expect(submitted.status).toBe('qualified')

    const dia = callDayOptions(today())[1]
    const state = await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(dia, 'afternoon'))
    expect(state.status).toBe('scheduled')
    if (state.status !== 'scheduled') return
    expect(state.preference).toEqual({ date: dia, slot: 'afternoon' })

    // Y el abogado la ve en el portal.
    const caso = await casoDePrueba()
    expect(caso.callPreference).toEqual({ date: dia, slot: 'afternoon' })
    expect(caso.callPreferenceSetAt).toBeTruthy()
  })

  it('sin haber enviado nada no se puede agendar', async () => {
    const dia = callDayOptions(today())[0]
    const state = await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(dia, 'morning'))
    expect(state.status).toBe('error')
    if (state.status !== 'error') return
    // El mensaje NO puede sugerir que la solicitud se perdió.
    expect(state.message).toMatch(/ya está registrado/i)
  })

  it('un envío que NO calificó no recibe permiso para agendar', async () => {
    const submitted = await submitLeadAction(
      IDLE,
      leadForm({ state: 'CAM', phone: '981 145 7023' }),
    )
    expect(submitted.status).toBe('unqualified')

    const dia = callDayOptions(today())[0]
    const state = await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(dia, 'morning'))
    expect(state.status).toBe('error')
  })

  it('una cookie manipulada no sirve: la firma no cuadra', async () => {
    await submitLeadAction(IDLE, leadForm())
    const original = jar.get('sl_lead') as string
    const [payload, firma] = original.split('.')
    // Se cambia la carga útil dejando la firma vieja.
    const otro = Buffer.from(JSON.stringify({ leadId: 'lead_otro', issuedAt: Date.now() })).toString(
      'base64url',
    )
    jar.set('sl_lead', `${otro}.${firma}`)

    const dia = callDayOptions(today())[0]
    const state = await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(dia, 'morning'))
    expect(state.status).toBe('error')
    expect(payload).not.toBe(otro)
  })

  it('elegir de nuevo sustituye la franja anterior', async () => {
    await submitLeadAction(IDLE, leadForm())
    const [primero, segundo] = callDayOptions(today())

    await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(primero, 'morning'))
    await scheduleCallAction(SCHEDULE_IDLE, scheduleForm(segundo, 'afternoon'))

    expect((await casoDePrueba()).callPreference).toEqual({ date: segundo, slot: 'afternoon' })
  })

  it('un día fuera de los ofrecidos se rechaza aunque haya permiso', async () => {
    await submitLeadAction(IDLE, leadForm())
    const state = await scheduleCallAction(SCHEDULE_IDLE, scheduleForm('2027-12-15', 'morning'))
    expect(state.status).toBe('error')

    expect((await casoDePrueba()).callPreference).toBeNull()
  })
})
