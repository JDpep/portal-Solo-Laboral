import { beforeEach, describe, expect, it } from 'vitest'
import { crearAbogado, resetDb } from './helpers'
import { db } from '@/lib/db/sql'
import { createLead, findLeadForStaff, listLeads, setLeadStatus } from '@/lib/db/leads'
import { markLeadsWithoutResponse } from '@/lib/db/leads'
import { convertLeadToCase } from '@/lib/db/cases'
import { upsertWebCallEvent } from '@/lib/db/events'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, instantFrom, today } from '@/lib/dates'

/**
 * LEADS SIN RESPUESTA.
 *
 * Lo corre el cron diario. Lo que se prueba aquí es sobre todo a quién NO toca:
 * un lead convertido, uno descartado y uno reciente tienen que seguir donde
 * están, porque este es el único proceso del sistema que cambia el estado de un
 * registro sin que nadie lo pida.
 */
let n = 0

async function crearLead(overrides: { diasDesdeEnvio?: number; nombre?: string } = {}) {
  n += 1
  const hoy = today()
  const dismissalDate = addDays(hoy, -20)
  const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })
  const lead = await createLead({
    fullName: overrides.nombre ?? `Prospecto ${n}`,
    phone: `55700000${String(n).padStart(2, '0')}`,
    state: 'CMX',
    dismissalDate,
    description: '',
    submittedOn: hoy,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })
  if (overrides.diasDesdeEnvio !== undefined) {
    await db()`
      UPDATE leads SET submitted_at = now() - make_interval(days => ${overrides.diasDesdeEnvio})
      WHERE id = ${lead.id}::uuid
    `
  }
  return lead
}

describe('marcar leads sin respuesta', () => {
  beforeEach(async () => {
    await resetDb()
    n = 0
  })

  it('marca el que lleva más días de la cuenta y deja el reciente', async () => {
    const viejo = await crearLead({ diasDesdeEnvio: 10, nombre: 'Lleva diez días' })
    const nuevo = await crearLead({ diasDesdeEnvio: 1, nombre: 'Llegó ayer' })

    const marcados = await markLeadsWithoutResponse(5)

    expect(marcados.map((l) => l.id)).toEqual([viejo.id])
    expect((await findLeadForStaff(viejo.id))!.status).toBe('no_response')
    expect((await findLeadForStaff(nuevo.id))!.status).toBe('new')
  })

  it('cuenta desde la llamada que pidió, no desde que se registró', async () => {
    const lead = await crearLead({ diasDesdeEnvio: 30 })
    // Se registró hace un mes pero pidió que le llamaran mañana: todavía no hay
    // nada que reprochar a nadie.
    await upsertWebCallEvent({
      leadId: lead.id,
      startAt: instantFrom(addDays(today(), 1), '10:00'),
      title: 'Llamada agendada',
    })

    expect(await markLeadsWithoutResponse(5)).toHaveLength(0)
    expect((await findLeadForStaff(lead.id))!.status).toBe('new')
  })

  it('una llamada que pasó hace mucho sí lo marca', async () => {
    const lead = await crearLead({ diasDesdeEnvio: 1 })
    await upsertWebCallEvent({
      leadId: lead.id,
      startAt: instantFrom(addDays(today(), -9), '10:00'),
      title: 'Llamada agendada',
    })

    expect(await markLeadsWithoutResponse(5)).toHaveLength(1)
  })

  it('NO toca un lead ya convertido en caso', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead({ diasDesdeEnvio: 40 })
    const result = await convertLeadToCase(lead.id, abogada.id)
    expect(result.ok).toBe(true)

    expect(await markLeadsWithoutResponse(5)).toHaveLength(0)
    // Un caso en curso no puede quedar colgando de un lead "sin respuesta".
    expect((await findLeadForStaff(lead.id))!.status).toBe('converted')
  })

  it('NO toca un lead descartado a mano', async () => {
    const lead = await crearLead({ diasDesdeEnvio: 40 })
    await setLeadStatus(lead.id, 'discarded')

    expect(await markLeadsWithoutResponse(5)).toHaveLength(0)
    // La decisión de una persona no se sobrescribe con una regla de calendario.
    expect((await findLeadForStaff(lead.id))!.status).toBe('discarded')
  })

  it('distingue a quién sí se contactó de a quién nunca se marcó', async () => {
    const contactado = await crearLead({ diasDesdeEnvio: 20, nombre: 'Sí lo llamaron' })
    await setLeadStatus(contactado.id, 'contacted')
    await crearLead({ diasDesdeEnvio: 20, nombre: 'Nadie lo llamó' })

    const marcados = await markLeadsWithoutResponse(5)
    expect(marcados).toHaveLength(2)

    // El segundo número es cola propia sin atender, no gente que ignorara al
    // despacho. La bitácora los guarda por separado justamente por eso.
    const sinContactar = marcados.filter((l) => !l.wasContacted)
    expect(sinContactar).toHaveLength(1)
    expect(sinContactar[0].fullName).toBe('Nadie lo llamó')
  })

  it('es idempotente: correrlo dos veces no vuelve a marcar nada', async () => {
    await crearLead({ diasDesdeEnvio: 20 })
    expect(await markLeadsWithoutResponse(5)).toHaveLength(1)
    // El cron corre a diario; si no fuera idempotente llenaría la bitácora de
    // renglones repetidos sobre el mismo lead.
    expect(await markLeadsWithoutResponse(5)).toHaveLength(0)
  })

  it('el lead sigue visible en el portal y se puede recuperar', async () => {
    const lead = await crearLead({ diasDesdeEnvio: 20 })
    await markLeadsWithoutResponse(5)

    // No desaparece: sigue en la lista, con su estado, y alguien puede volver a
    // marcarlo o convertirlo.
    const listado = await listLeads({})
    expect(listado.rows.some((r) => r.id === lead.id)).toBe(true)

    await setLeadStatus(lead.id, 'contacted')
    expect((await findLeadForStaff(lead.id))!.status).toBe('contacted')
  })

  it('no alcanza a un envío que nunca fue visible para el despacho', async () => {
    const hoy = today()
    // No califica: fuera de cobertura. Nunca se le prometió una llamada.
    const dismissalDate = addDays(hoy, -10)
    const verdict = qualifyLead({ state: 'CAM', dismissalDate, submittedOn: hoy })
    const lead = await createLead({
      fullName: 'Fuera de cobertura',
      phone: '9811457023',
      state: 'CAM',
      dismissalDate,
      description: '',
      submittedOn: hoy,
      qualificationStatus: verdict.status,
      qualificationReason: verdict.reason,
      dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
    })
    await db()`UPDATE leads SET submitted_at = now() - interval '40 days' WHERE id = ${lead.id}::uuid`

    expect(await markLeadsWithoutResponse(5)).toHaveLength(0)
  })
})
