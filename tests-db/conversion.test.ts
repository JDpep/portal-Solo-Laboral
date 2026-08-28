import { beforeEach, describe, expect, it } from 'vitest'
import { crearAbogado, resetDb } from './helpers'
import { db } from '@/lib/db/sql'
import { createLead, listLeads, findLeadForStaff } from '@/lib/db/leads'
import {
  closeCase,
  convertLeadToCase,
  findCaseById,
  listCases,
  listStatusHistory,
  reopenCase,
} from '@/lib/db/cases'
import { listChecklist, progressOf, setChecklistItemStatus } from '@/lib/db/checklist'
import { listAuditForEntity } from '@/lib/db/audit'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, today } from '@/lib/dates'
import type { StateCode } from '@/lib/domain/states'
import type { LeadSource } from '@/lib/domain/types'

/**
 * LEAD → CASO.
 *
 * Estas pruebas corren contra Postgres a propósito: casi todo lo que afirman
 * lo garantiza la BASE, no el código —el folio único, el caso irrepetible, la
 * bitácora que no se deja reescribir—. Contra un doble en memoria pasarían
 * igual sin probar nada de eso.
 */
async function crearLead(
  overrides: Partial<{ fullName: string; phone: string; state: StateCode; daysAgo: number; source: LeadSource }> = {},
) {
  const hoy = today()
  const state = overrides.state ?? 'CMX'
  const dismissalDate = addDays(hoy, -(overrides.daysAgo ?? 20))
  const verdict = qualifyLead({ state, dismissalDate, submittedOn: hoy })

  return createLead({
    fullName: overrides.fullName ?? 'Juan Pérez Villanueva',
    phone: overrides.phone ?? '5512345678',
    state,
    dismissalDate,
    description: 'Me despidieron sin liquidación.',
    submittedOn: hoy,
    source: overrides.source,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })
}

beforeEach(async () => {
  await resetDb()
})

describe('conversión de lead a caso', () => {
  it('crea exactamente un caso, hereda el folio y no recaptura nada', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()

    const result = await convertLeadToCase(lead.id, abogada.id, abogada.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const detail = await findCaseById(result.caseId)
    expect(detail).not.toBeNull()
    // El folio es el MISMO: una sola referencia para la misma persona desde
    // que llega hasta que se cierra su asunto.
    expect(detail?.case.folio).toBe(lead.folio)
    expect(detail?.case.status).toBe('active')
    expect(detail?.case.assignedUserId).toBe(abogada.id)
    // Los datos no se copian a mano: se consultan del lead.
    expect(detail?.lead.fullName).toBe(lead.fullName)
    expect(detail?.lead.dismissalDate).toBe(lead.dismissalDate)

    const [{ total }] = await db()`SELECT count(*)::int AS total FROM cases`
    expect(total).toBe(1)

    // El lead queda marcado y apuntando a su caso.
    const after = await findLeadForStaff(lead.id)
    expect(after?.status).toBe('converted')
    expect(after?.caseId).toBe(result.caseId)
    expect(after?.convertedToCaseAt).toBeTruthy()
  })

  it('NO se puede convertir dos veces', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()

    const primero = await convertLeadToCase(lead.id, abogada.id)
    const segundo = await convertLeadToCase(lead.id, abogada.id)

    expect(primero.ok).toBe(true)
    expect(segundo).toEqual({ ok: false, code: 'already_converted' })

    const [{ total }] = await db()`SELECT count(*)::int AS total FROM cases`
    expect(total).toBe(1)
  })

  it('dos conversiones simultáneas tampoco crean dos casos', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()

    // Es el escenario real: dos abogados con la ficha abierta pulsando el
    // botón a la vez. Lo que lo impide no es una comprobación previa —esa la
    // ganaría el segundo por carrera— sino el UNIQUE de la base.
    const [a, b] = await Promise.all([
      convertLeadToCase(lead.id, abogada.id),
      convertLeadToCase(lead.id, abogada.id),
    ])

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const [{ total }] = await db()`SELECT count(*)::int AS total FROM cases`
    expect(total).toBe(1)
  })

  it('un lead que no pasó el filtro no se puede convertir aunque se adivine su id', async () => {
    const abogada = await crearAbogado()
    const fuera = await crearLead({ state: 'CAM', phone: '9811457023' })
    expect(fuera.visibleToStaff).toBe(false)

    const result = await convertLeadToCase(fuera.id, abogada.id)
    expect(result).toEqual({ ok: false, code: 'not_visible' })
  })

  it('la conversión genera la ruta completa desde la plantilla', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const items = await listChecklist(result.caseId)
    const [{ total }] = await db()`
      SELECT count(*)::int AS total FROM case_checklist_template_items i
      JOIN case_checklist_templates t ON t.id = i.template_id WHERE t.is_default
    `
    expect(items).toHaveLength(total)
    expect(items.every((item) => item.status === 'pending')).toBe(true)
    expect(items.map((item) => item.position)).toEqual(
      Array.from({ length: items.length }, (_, i) => i + 1),
    )
  })

  it('anota el estado inicial y firma la bitácora', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const history = await listStatusHistory(result.caseId)
    expect(history).toHaveLength(1)
    expect(history[0].previousStatus).toBeNull()
    expect(history[0].newStatus).toBe('active')
    expect(history[0].changedBy).toBe(abogada.id)

    const audit = await listAuditForEntity('case', result.caseId)
    expect(audit.map((entry) => entry.action)).toContain('lead_convert_to_case')
  })
})

describe('ruta del caso', () => {
  it('el progreso avanza y los pasos que no aplican no cuentan en el total', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const items = await listChecklist(result.caseId)
    expect(progressOf(items)).toEqual({ completed: 0, total: items.length })

    await setChecklistItemStatus(items[0].id, 'completed', abogada.id)
    await setChecklistItemStatus(items[1].id, 'not_applicable', abogada.id)

    const after = await listChecklist(result.caseId)
    // Un paso hecho, uno fuera de la cuenta: sin esto, un caso donde tres
    // pasos no aplican no llegaría nunca al 100 %.
    expect(progressOf(after)).toEqual({ completed: 1, total: items.length - 1 })
  })

  it('completar un paso pone su fecha, y deshacerlo la quita', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')
    const [primero] = await listChecklist(result.caseId)

    const completado = await setChecklistItemStatus(primero.id, 'completed', abogada.id)
    expect(completado?.completedAt).toBeTruthy()
    expect(completado?.completedBy).toBe(abogada.id)
    // Se completó sin haberse "empezado": la fecha de inicio se pone igual, o
    // el paso quedaría terminado sin haber empezado nunca.
    expect(completado?.startedAt).toBeTruthy()

    const deshecho = await setChecklistItemStatus(primero.id, 'pending', abogada.id)
    expect(deshecho?.completedAt).toBeNull()
  })

  it('la etapa actual del caso sigue al primer paso sin terminar', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const items = await listChecklist(result.caseId)
    const inicial = await findCaseById(result.caseId)
    expect(inicial?.case.currentStage).toBe(items[0].title)

    await setChecklistItemStatus(items[0].id, 'completed', abogada.id)
    const despues = await findCaseById(result.caseId)
    // Nadie escribió la etapa: la mantiene la base a partir de la ruta, así
    // que no puede contradecir lo que se ve al abrir el caso.
    expect(despues?.case.currentStage).toBe(items[1].title)
  })
})

describe('finalizar seguimiento', () => {
  it('cerrar NO borra: conserva la ruta, la historia y el motivo', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const closed = await closeCase(
      result.caseId,
      { reason: 'client_declined', note: 'Prefiere no continuar por ahora.' },
      abogada.id,
    )
    expect(closed?.status).toBe('discontinued')
    expect(closed?.closedAt).toBeTruthy()
    expect(closed?.closedReason).toBe('client_declined')

    // Sigue existiendo, con todo lo suyo.
    const detail = await findCaseById(result.caseId)
    expect(detail).not.toBeNull()
    expect(await listChecklist(result.caseId)).not.toHaveLength(0)

    const history = await listStatusHistory(result.caseId)
    expect(history).toHaveLength(2)
    expect(history[1].newStatus).toBe('discontinued')
  })

  it('el motivo decide el estado final: concluido no es lo mismo que abandonado', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const closed = await closeCase(result.caseId, { reason: 'completed' }, abogada.id)
    // El histórico tiene que poder contar por separado "cuántos terminamos" y
    // "cuántos se cayeron": son las dos preguntas que el despacho va a hacer.
    expect(closed?.status).toBe('completed')
  })

  it('un caso cerrado sale de seguimiento y aparece en el histórico', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    expect((await listCases({ scope: 'open' })).total).toBe(1)
    await closeCase(result.caseId, { reason: 'completed' }, abogada.id)

    expect((await listCases({ scope: 'open' })).total).toBe(0)
    expect((await listCases({ scope: 'closed' })).total).toBe(1)
    expect((await listCases({ scope: 'all' })).total).toBe(1)
  })

  it('reabrir conserva el cierre anterior en la historia', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    await closeCase(result.caseId, { reason: 'client_unresponsive' }, abogada.id)
    const reabierto = await reopenCase(result.caseId, abogada.id, 'El cliente volvió a llamar')

    expect(reabierto?.status).toBe('active')
    expect(reabierto?.closedAt).toBeNull()
    // El cierre no se borra de la historia; deja de ser el presente.
    const history = await listStatusHistory(result.caseId)
    expect(history.map((h) => h.newStatus)).toEqual(['active', 'discontinued', 'active'])
  })
})

describe('garantías que vive la base, no la aplicación', () => {
  it('el folio es único aunque diez altas caigan a la vez', async () => {
    const leads = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        crearLead({ phone: `55123456${String(i).padStart(2, '0')}` }),
      ),
    )
    const folios = leads.map((lead) => lead.folio)
    expect(folios.every(Boolean)).toBe(true)
    expect(new Set(folios).size).toBe(10)
  })

  it('un alta manual siempre lleva folio, aunque no pasara el filtro', async () => {
    // Registrarla a mano YA fue la decisión que el filtro venía a tomar: el
    // abogado que la captura sabe algo que el formulario no puede saber.
    const manual = await crearLead({ state: 'CAM', phone: '9811457023', source: 'manual' })
    expect(manual.visibleToStaff).toBe(true)
    expect(manual.folio).toMatch(/^SL-\d{6}$/)
    expect((await listLeads()).total).toBe(1)
  })

  it('la bitácora no se puede reescribir ni borrar', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    const result = await convertLeadToCase(lead.id, abogada.id)
    if (!result.ok) throw new Error('no convirtió')

    const sql = db()
    // Ni la aplicación ni un administrador: el candado está en un trigger, no
    // en un permiso que alguien pueda concederse.
    await expect(sql`UPDATE audit_logs SET action = 'otra_cosa'`).rejects.toThrow(
      /solo inserción/i,
    )
    await expect(sql`DELETE FROM audit_logs`).rejects.toThrow(/solo inserción/i)
    await expect(sql`DELETE FROM case_status_history`).rejects.toThrow(/solo inserción/i)
  })

  it('un caso no se puede borrar mientras exista su lead', async () => {
    const abogada = await crearAbogado()
    const lead = await crearLead()
    await convertLeadToCase(lead.id, abogada.id)

    // ON DELETE RESTRICT: la trazabilidad no depende de que a nadie se le
    // ocurra borrar.
    await expect(db()`DELETE FROM leads WHERE id = ${lead.id}::uuid`).rejects.toThrow()
  })
})
