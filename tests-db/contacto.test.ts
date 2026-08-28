import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ELEGIR CÓMO CONTINUAR, con su autorización real.
 *
 * El tarro de galletas es de verdad: lo que se prueba aquí no es el texto del
 * mensaje —eso vive en tests/whatsapp.test.ts, como función pura— sino que
 * NADIE pueda registrar actividad sobre la solicitud de otra persona, y que
 * abrir WhatsApp no invente un mensaje enviado.
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

// El número del despacho sale SIEMPRE de la configuración del servidor. Se
// fija antes de importar nada para que sea el que vean las acciones.
process.env.SOLO_LABORAL_WHATSAPP_NUMBER = '525512345678'
process.env.QUICK_CALL_MIN_DELAY = '10'
process.env.QUICK_CALL_MAX_DELAY = '15'

const { submitLeadAction, scheduleCallAction, openWhatsAppAction, requestQuickCallAction } =
  await import('@/app/solicitud/actions')
const { resetDb } = await import('./helpers')
const { db } = await import('@/lib/db/sql')
const { listLeads } = await import('@/lib/db/leads')
const { listEventsForLead } = await import('@/lib/db/events')
const { listAuditForEntity } = await import('@/lib/db/audit')
const { resetRateLimits } = await import('@/lib/auth/rate-limit')
const { addDays, today } = await import('@/lib/dates')
const { callDayOptions } = await import('@/lib/domain/call-time')

const IDLE = { status: 'idle' } as const

const DESCRIPCION =
  'Me despidieron del almacén donde trabajaba. Mi jefe se llama Ramiro y me pagaba 9.400 pesos quincenales en efectivo.'

function leadForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData()
  const values: Record<string, string> = {
    fullName: 'Juan Pérez Villanueva',
    phone: '55 1234 5678',
    state: 'MEX',
    dismissalDate: addDays(today(), -18),
    description: DESCRIPCION,
    ...overrides,
  }
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

async function elLead() {
  const page = await listLeads({ query: 'Juan Pérez Villanueva' })
  return page.rows[0]
}

beforeEach(async () => {
  jar.clear()
  await resetDb()
  resetRateLimits()
  ip = '187.190.0.1'
})

describe('opciones de contacto tras calificar', () => {
  it('un lead calificado recibe el enlace de WhatsApp ya armado', async () => {
    const state = await submitLeadAction(IDLE, leadForm())
    expect(state.status).toBe('qualified')
    if (state.status !== 'qualified') return

    const url = state.contact.whatsappUrl
    expect(url).not.toBeNull()
    // El destino es el número de la configuración, no uno que venga del cliente.
    expect(url).toContain('https://wa.me/525512345678?text=')

    const mensaje = decodeURIComponent(new URL(url as string).searchParams.get('text') as string)
    expect(mensaje).toContain('Juan Pérez Villanueva')
    expect(mensaje).toContain('Estado de México')
    expect(mensaje).toContain('hace 18 días')
    expect(mensaje).toContain(state.folio)
  })

  it('el mensaje NO lleva lo que la persona contó', async () => {
    const state = await submitLeadAction(IDLE, leadForm())
    if (state.status !== 'qualified') throw new Error('no calificó')
    const mensaje = decodeURIComponent(
      new URL(state.contact.whatsappUrl as string).searchParams.get('text') as string,
    )

    // Ese texto puede traer nombres de terceros, sueldos o detalles que no
    // hacen falta para abrir una conversación — y un WhatsApp enviado ya no se
    // recoge. El abogado lo lee completo en la ficha, buscando el folio.
    expect(mensaje).not.toContain('Ramiro')
    expect(mensaje).not.toContain('9.400')
    expect(mensaje).not.toContain(DESCRIPCION)
    // Tampoco viajan identificadores internos: el folio es el único que existe
    // para esto.
    const lead = await elLead()
    expect(mensaje).not.toContain(lead.id)
  })

  it('un lead que NO calificó no recibe ninguna vía de contacto', async () => {
    const state = await submitLeadAction(IDLE, leadForm({ state: 'CAM', phone: '981 145 7023' }))
    expect(state.status).toBe('unqualified')
    // Y sin permiso, la acción de WhatsApp no puede tocar nada.
    await openWhatsAppAction()

    const [{ total }] = await db()`
      SELECT count(*)::int AS total FROM leads WHERE whatsapp_opened_at IS NOT NULL
    `
    expect(total).toBe(0)
  })

  it('sin número configurado no se ofrece WhatsApp, en vez de un botón roto', async () => {
    const anterior = process.env.SOLO_LABORAL_WHATSAPP_NUMBER
    process.env.SOLO_LABORAL_WHATSAPP_NUMBER = ''
    try {
      const state = await submitLeadAction(IDLE, leadForm())
      if (state.status !== 'qualified') throw new Error('no calificó')
      expect(state.contact.whatsappUrl).toBeNull()
    } finally {
      process.env.SOLO_LABORAL_WHATSAPP_NUMBER = anterior
    }
  })
})

describe('abrir WhatsApp', () => {
  it('registra que abrió, y NO que envió', async () => {
    await submitLeadAction(IDLE, leadForm())
    await openWhatsAppAction()

    const lead = await elLead()
    expect(lead.whatsappOpenedAt).toBeTruthy()
    expect(lead.preferredContactMethod).toBe('whatsapp')

    const audit = await listAuditForEntity('lead', lead.id)
    const entrada = audit.find((e) => e.action === 'lead_whatsapp_opened')
    expect(entrada).toBeTruthy()
    expect((entrada?.after as Record<string, unknown>).userType).toBe('prospect')
    // Con un enlace wa.me el sistema deja de ver a la persona en cuanto salta
    // a la aplicación. Afirmar que envió sería inventarse un hecho.
    expect((entrada?.after as Record<string, unknown>).messageSent).toBeNull()

    const columnas = await db()`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name LIKE '%sent%'
    `
    expect(columnas).toHaveLength(0)
  })

  it('NO cambia el estado del lead a contactado', async () => {
    await submitLeadAction(IDLE, leadForm())
    await openWhatsAppAction()

    const lead = await elLead()
    // Que la persona escriba no es que el despacho la haya atendido. Marcar
    // "contactado" aquí escondería en la lista a quien todavía espera.
    expect(lead.status).toBe('new')
    expect(lead.contactedAt).toBeNull()
  })

  it('no crea un segundo lead ni un segundo folio', async () => {
    const state = await submitLeadAction(IDLE, leadForm())
    if (state.status !== 'qualified') throw new Error('no calificó')

    await openWhatsAppAction()
    await openWhatsAppAction()

    const [{ leads, cases }] = await db()`
      SELECT (SELECT count(*)::int FROM leads) AS leads,
             (SELECT count(*)::int FROM cases) AS cases
    `
    expect(leads).toBe(1)
    expect(cases).toBe(0)
    expect((await elLead()).folio).toBe(state.folio)
  })

  it('el segundo clic conserva la primera hora de apertura', async () => {
    await submitLeadAction(IDLE, leadForm())
    await openWhatsAppAction()
    const primera = (await elLead()).whatsappOpenedAt

    await openWhatsAppAction()
    // La primera vez es la que dice cuánto tardó en dar el paso.
    expect((await elLead()).whatsappOpenedAt).toBe(primera)
  })
})

describe('llamada agendada y llamada próxima', () => {
  it('agendar guarda la preferencia y crea el evento en el calendario', async () => {
    await submitLeadAction(IDLE, leadForm())
    const dia = callDayOptions(today())[1]

    const state = await scheduleCallAction({ status: 'idle' }, formOf({ callDate: dia, callTime: '16:20' }))
    expect(state.status).toBe('scheduled')

    const lead = await elLead()
    expect(lead.preferredContactMethod).toBe('scheduled_call')
    expect(lead.callPreference).toEqual({ date: dia, time: '16:20' })

    const eventos = await listEventsForLead(lead.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].eventType).toBe('call')
    expect(eventos[0].source).toBe('web_form')
    expect(eventos[0].status).toBe('scheduled')
  })

  it('cambiar de opinión mueve la llamada, no la duplica', async () => {
    await submitLeadAction(IDLE, leadForm())
    const [primero, segundo] = callDayOptions(today())

    await scheduleCallAction({ status: 'idle' }, formOf({ callDate: primero, callTime: '10:00' }))
    await scheduleCallAction({ status: 'idle' }, formOf({ callDate: segundo, callTime: '16:20' }))
    // Y después pide que le llamen enseguida, que ocupa el mismo hueco.
    await requestQuickCallAction()

    const lead = await elLead()
    const eventos = await listEventsForLead(lead.id)
    // Un índice único parcial lo garantiza en la base: la agenda del abogado
    // no puede llenarse de llamadas fantasma porque alguien dudara.
    expect(eventos).toHaveLength(1)
  })

  it('la llamada próxima queda agendada dentro de la ventana prometida', async () => {
    await submitLeadAction(IDLE, leadForm())
    const antes = Date.now()

    const state = await requestQuickCallAction()
    expect(state.status).toBe('requested')
    if (state.status !== 'requested') return
    expect(state.window).toEqual({ min: 10, max: 15 })

    const lead = await elLead()
    expect(lead.preferredContactMethod).toBe('quick_call')
    expect(lead.scheduledCallAt).toBeTruthy()

    const previsto = Date.parse(lead.scheduledCallAt as string)
    // Se agenda en el MÍNIMO de la ventana: más vale que el abogado la vea un
    // poco antes de lo prometido que un poco después.
    expect(previsto - antes).toBeGreaterThanOrEqual(9 * 60_000)
    expect(previsto - antes).toBeLessThanOrEqual(11 * 60_000)

    const eventos = await listEventsForLead(lead.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].startAt).toBe(lead.scheduledCallAt)
  })

  it('sin permiso no se puede pedir una llamada sobre la solicitud de otro', async () => {
    // Nunca llega un id desde el formulario: la autorización es la cookie
    // firmada, y sin ella no hay a qué solicitud apuntar.
    const state = await requestQuickCallAction()
    expect(state.status).toBe('error')
    if (state.status !== 'error') return
    // El mensaje NO puede sugerir que la solicitud se perdió.
    expect(state.message).toMatch(/ya está registrado/i)
  })
})

function formOf(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}
