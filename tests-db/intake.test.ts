import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from './helpers'
import {
  countLeadsByStatus,
  createLead,
  findLeadForStaff,
  findRecentSubmission,
  listLeads,
} from '@/lib/db/leads'
import { parseLeadForm } from '@/lib/domain/lead-form'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays } from '@/lib/dates'
import type { LeadFormValues } from '@/lib/domain/lead-form'
import type { Lead } from '@/lib/domain/types'

const HOY = '2026-08-21'

/**
 * Reproduce el camino real de un envío: validar → calificar → guardar.
 * Es el mismo encadenamiento que hace la server action, sin la capa HTTP.
 */
async function enviar(overrides: Partial<LeadFormValues>): Promise<Lead> {
  const values: LeadFormValues = {
    fullName: 'Juan Pérez Villanueva',
    phone: '5512345678',
    state: 'CMX',
    dismissalDate: addDays(HOY, -20),
    description: 'Trabajaba en un almacén y me despidieron sin liquidación.',
    ...overrides,
  }
  const parsed = parseLeadForm(values, HOY)
  if (!parsed.ok) throw new Error(`datos inválidos: ${JSON.stringify(parsed.fieldErrors)}`)
  const verdict = qualifyLead({
    state: parsed.data.state,
    dismissalDate: parsed.data.dismissalDate,
    submittedOn: HOY,
  })
  return createLead({
    ...parsed.data,
    submittedOn: HOY,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })
}

beforeEach(async () => {
  await resetDb()
})

describe('captación y filtro', () => {
  it('un envío calificado recibe folio y aparece en el portal', async () => {
    const lead = await enviar({})
    expect(lead.qualificationStatus).toBe('qualified')
    expect(lead.folio).toBe('SL-000001')

    const page = await listLeads()
    expect(page.total).toBe(1)
    expect(page.rows[0].id).toBe(lead.id)
  })

  it('los folios son consecutivos y solo los consumen los calificados', async () => {
    await enviar({}) // califica -> SL-000001
    const fuera = await enviar({ state: 'CAM', phone: '9811457023' }) // no califica
    const segundo = await enviar({ phone: '5590033471' }) // califica -> SL-000002

    expect(fuera.folio).toBeNull()
    expect(segundo.folio).toBe('SL-000002')
  })

  it('NO TODOS LOS FORMULARIOS LLEGAN AL PORTAL: los no calificados se guardan pero no se muestran', async () => {
    const campeche = await enviar({ state: 'CAM', phone: '9811457023' })
    const viejo = await enviar({ dismissalDate: addDays(HOY, -85), phone: '5590033471' })
    const limite = await enviar({ dismissalDate: addDays(HOY, -60), phone: '5512780064' })

    for (const lead of [campeche, viejo, limite]) {
      expect(lead.qualificationStatus).toBe('unqualified')
      expect(lead.folio).toBeNull()
    }

    // Existen en la base…
    expect(await countLeadsByStatus()).toEqual({ qualified: 0, unqualified: 3 })
    // …y no existen para los abogados.
    expect((await listLeads()).total).toBe(0)
  })

  it('adivinar el id de un no calificado no permite leerlo', async () => {
    const fuera = await enviar({ state: 'CAM', phone: '9811457023' })
    expect(await findLeadForStaff(fuera.id)).toBeNull()

    const dentro = await enviar({})
    expect((await findLeadForStaff(dentro.id))?.folio).toBe('SL-000001')
    expect(await findLeadForStaff('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('detecta el reenvío del mismo teléfono y el mismo despido', async () => {
    const primero = await enviar({})
    const repetido = await findRecentSubmission(primero.phone, primero.dismissalDate, 6 * 3600_000)
    expect(repetido?.id).toBe(primero.id)

    // Otro despido del mismo teléfono no es un reenvío: es otra solicitud.
    expect(await findRecentSubmission(primero.phone, addDays(HOY, -3), 6 * 3600_000)).toBeNull()
    // Y fuera de la ventana tampoco cuenta.
    expect(await findRecentSubmission(primero.phone, primero.dismissalDate, 0)).toBeNull()
  })

  it('congela los días desde el despido al momento del envío', async () => {
    const lead = await enviar({ dismissalDate: addDays(HOY, -20) })
    // No se recalcula al leer: si lo hiciera, un caso calificado acabaría
    // mostrando 70 u 80 días y parecería que el filtro falló.
    expect(lead.dismissalDaysAtSubmission).toBe(20)
    expect((await findLeadForStaff(lead.id))?.dismissalDaysAtSubmission).toBe(20)
  })

  it('la búsqueda del portal encuentra por nombre, folio y teléfono', async () => {
    const lead = await enviar({ fullName: 'María Fernanda Solís', phone: '5528461130' })
    expect((await listLeads({ query: 'fernanda' })).total).toBe(1)
    expect((await listLeads({ query: lead.folio! })).total).toBe(1)
    expect((await listLeads({ query: '2846' })).total).toBe(1)
    expect((await listLeads({ query: 'nadie' })).total).toBe(0)
  })

  it('lo que se lee viene de la base, no del objeto que devolvió el alta', async () => {
    const lead = await enviar({})
    lead.fullName = 'MUTADO'
    // En memoria esto probaba que el repositorio clonaba. Con Postgres de por
    // medio prueba algo más fuerte: que la lectura vuelve a la base y no hay
    // ningún objeto vivo compartido que alguien pueda cambiar por detrás.
    expect((await findLeadForStaff(lead.id))?.fullName).toBe('Juan Pérez Villanueva')
  })
})
