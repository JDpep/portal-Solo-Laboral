import { beforeEach, describe, expect, it } from 'vitest'
import { crearAbogado, resetDb } from './helpers'
import { db } from '@/lib/db/sql'
import { createLead } from '@/lib/db/leads'
import {
  closedCaseMetrics,
  closeCase,
  convertLeadToCase,
  listCases,
  listStatusHistory,
  reopenCase,
} from '@/lib/db/cases'
import { listChecklist, setChecklistItemStatus, updateChecklistItem } from '@/lib/db/checklist'
import { listEventsForCase } from '@/lib/db/events'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, instantFrom, today } from '@/lib/dates'
import type { CaseCloseReason } from '@/lib/domain/types'

/**
 * EL HISTÓRICO.
 *
 * Un caso cerrado no se borra ni se muda: es la misma fila vista por el otro
 * lado. Lo que se prueba aquí es que ese "otro lado" separa bien —lo cerrado no
 * aparece en Seguimiento y lo abierto no aparece en el histórico— y que los
 * indicadores cuentan sobre exactamente el mismo filtro que la lista.
 */
let contador = 0

async function crearCaso(nombre: string) {
  contador += 1
  const hoy = today()
  const dismissalDate = addDays(hoy, -20)
  const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })

  const lead = await createLead({
    fullName: nombre,
    phone: `55123456${String(contador).padStart(2, '0')}`,
    state: 'CMX',
    dismissalDate,
    description: 'Me despidieron sin liquidación.',
    submittedOn: hoy,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })

  const abogada = await crearAbogado(`Abogada ${contador}`)
  const result = await convertLeadToCase(lead.id, abogada.id)
  if (!result.ok) throw new Error(`no se pudo convertir: ${result.code}`)
  return { caseId: result.caseId, abogadaId: abogada.id, lead }
}

/** Estira la vida del caso hacia atrás para poder medir duraciones reales. */
async function duroDias(caseId: string, dias: number) {
  await db()`
    UPDATE cases
       SET opened_at = closed_at - make_interval(days => ${dias})
     WHERE id = ${caseId}::uuid
  `
}

async function cerrar(nombre: string, reason: CaseCloseReason, dias?: number) {
  const { caseId, abogadaId } = await crearCaso(nombre)
  await closeCase(caseId, { reason, note: reason === 'other' ? 'Motivo escrito a mano.' : '' }, abogadaId)
  if (dias !== undefined) await duroDias(caseId, dias)
  return { caseId, abogadaId }
}

describe('separación entre seguimiento e histórico', () => {
  beforeEach(async () => {
    await resetDb()
    contador = 0
  })

  it('un caso cerrado sale del seguimiento y entra en el histórico', async () => {
    const { caseId, abogadaId } = await crearCaso('Juan Pérez Villanueva')

    expect((await listCases({ scope: 'open' })).total).toBe(1)
    expect((await listCases({ scope: 'closed' })).total).toBe(0)

    await closeCase(caseId, { reason: 'completed' }, abogadaId)

    expect((await listCases({ scope: 'open' })).total).toBe(0)
    const cerrados = await listCases({ scope: 'closed' })
    expect(cerrados.total).toBe(1)
    // Conserva todo: no es un archivo aparte, es la misma fila.
    expect(cerrados.rows[0].closedReason).toBe('completed')
    expect(cerrados.rows[0].closedAt).not.toBeNull()
    expect(cerrados.rows[0].folio).toBe('SL-000001')
  })

  it('reabrir lo devuelve al seguimiento y lo quita del histórico', async () => {
    const { caseId, abogadaId } = await cerrar('Ana Ruiz', 'client_declined')
    expect((await listCases({ scope: 'closed' })).total).toBe(1)

    await reopenCase(caseId, abogadaId, 'Volvió a contestar')

    expect((await listCases({ scope: 'closed' })).total).toBe(0)
    expect((await listCases({ scope: 'open' })).total).toBe(1)
  })

  it('ordena por fecha de cierre, que es la columna del histórico', async () => {
    const primero = await cerrar('Primero', 'completed')
    const segundo = await cerrar('Segundo', 'completed')
    // El primero se cierra "antes": se le retrasa el cierre a mano.
    await db()`UPDATE cases SET closed_at = now() - interval '10 days' WHERE id = ${primero.caseId}::uuid`

    const recientes = await listCases({ scope: 'closed', sort: 'closedAt', direction: 'desc' })
    expect(recientes.rows.map((r) => r.clientName)).toEqual(['Segundo', 'Primero'])

    const antiguos = await listCases({ scope: 'closed', sort: 'closedAt', direction: 'asc' })
    expect(antiguos.rows.map((r) => r.clientName)).toEqual(['Primero', 'Segundo'])
    expect(segundo.caseId).toBeTruthy()
  })
})

describe('indicadores del histórico', () => {
  beforeEach(async () => {
    await resetDb()
    contador = 0
  })

  it('cuenta por motivo y deja en cero los motivos sin casos', async () => {
    await cerrar('Uno', 'completed')
    await cerrar('Dos', 'completed')
    await cerrar('Tres', 'client_unresponsive')

    const m = await closedCaseMetrics()
    expect(m.total).toBe(3)
    expect(m.byReason.completed).toBe(2)
    expect(m.byReason.client_unresponsive).toBe(1)
    // Un motivo sin casos vale 0, no falta: la barra tiene que poder pintarse.
    expect(m.byReason.not_viable).toBe(0)
    expect(m.byReason.other).toBe(0)
  })

  it('la duración típica es la MEDIANA, no el promedio', async () => {
    // Tres casos cortos y uno larguísimo. El promedio saldría 108 días y haría
    // creer que el despacho tarda cuatro meses; la mediana dice 10.
    await cerrar('Corto A', 'completed', 5)
    await cerrar('Corto B', 'completed', 10)
    await cerrar('Corto C', 'completed', 15)
    await cerrar('Eterno', 'completed', 400)

    const m = await closedCaseMetrics()
    expect(m.medianDays).toBe(13) // mediana de 5,10,15,400 = 12.5 -> 13
    expect(m.medianDays).toBeLessThan(100)
    expect(m.shortestDays).toBe(5)
    expect(m.longestDays).toBe(400)
  })

  it('sin casos cerrados no inventa una duración', async () => {
    await crearCaso('Sigue abierto')
    const m = await closedCaseMetrics()
    expect(m.total).toBe(0)
    // Null y no 0: "cero días" sería una afirmación falsa sobre nada.
    expect(m.medianDays).toBeNull()
    expect(m.shortestDays).toBeNull()
  })

  it('los indicadores cuentan sobre el MISMO filtro que la lista', async () => {
    await cerrar('Concluido uno', 'completed')
    await cerrar('Concluido dos', 'completed')
    await cerrar('No procedió', 'not_viable')

    const filtro = { scope: 'closed' as const, closeReason: 'completed' as CaseCloseReason }
    const lista = await listCases(filtro)
    const m = await closedCaseMetrics(filtro)

    // Es la garantía de la pantalla: el número de arriba y los renglones de
    // abajo no pueden discrepar.
    expect(m.total).toBe(lista.total)
    expect(m.total).toBe(2)
  })

  it('la búsqueda también encoge los indicadores', async () => {
    await cerrar('Juan Pérez Villanueva', 'completed')
    await cerrar('Ana Ruiz Mercado', 'completed')

    const filtro = { scope: 'closed' as const, query: 'Ana' }
    expect((await closedCaseMetrics(filtro)).total).toBe(1)
    expect((await listCases(filtro)).total).toBe(1)
  })

  it('cuenta los pasos completados de la ruta, sin los que no aplican', async () => {
    const { caseId, abogadaId } = await crearCaso('Con ruta a medias')
    const pasos = await listChecklist(caseId)

    await setChecklistItemStatus(pasos[0].id, 'completed', abogadaId)
    await setChecklistItemStatus(pasos[1].id, 'completed', abogadaId)
    await setChecklistItemStatus(pasos[2].id, 'not_applicable', abogadaId)
    await closeCase(caseId, { reason: 'completed' }, abogadaId)

    const m = await closedCaseMetrics()
    expect(m.stepsDone).toBe(2)
    // Los "no aplica" salen del denominador: si contaran, un caso con tres
    // pasos que no aplican no podría llegar nunca al 100 %.
    expect(m.stepsTotal).toBe(pasos.length - 1)
  })

  it('un caso abierto no ensucia los indicadores del histórico', async () => {
    await cerrar('Cerrado', 'completed', 4)
    await crearCaso('Abierto')

    const m = await closedCaseMetrics()
    expect(m.total).toBe(1)
    expect(m.medianDays).toBe(4)
  })
})

describe('terminar la ruta cierra el caso solo', () => {
  beforeEach(async () => {
    await resetDb()
    contador = 0
  })

  it('completar el último paso manda el caso al histórico', async () => {
    const { caseId, abogadaId } = await crearCaso('Juan Pérez Villanueva')
    const pasos = await listChecklist(caseId)

    // Uno a uno: hasta el penúltimo el caso sigue en seguimiento.
    for (const paso of pasos.slice(0, -1)) {
      await setChecklistItemStatus(paso.id, 'completed', abogadaId)
    }
    expect((await listCases({ scope: 'open' })).total).toBe(1)
    expect((await listCases({ scope: 'closed' })).total).toBe(0)

    await setChecklistItemStatus(pasos[pasos.length - 1].id, 'completed', abogadaId)

    // El último paso de la plantilla se llama "Cerrar caso": marcarlo YA es la
    // decisión de cerrar, y pedir además un formulario era pedirla dos veces.
    expect((await listCases({ scope: 'open' })).total).toBe(0)
    const cerrados = await listCases({ scope: 'closed' })
    expect(cerrados.total).toBe(1)
    expect(cerrados.rows[0].closedReason).toBe('completed')
    expect(cerrados.rows[0].closedAt).not.toBeNull()
  })

  it('deja el renglón en el historial y firma quién lo completó', async () => {
    const { caseId, abogadaId } = await crearCaso('Ana Ruiz')
    for (const paso of await listChecklist(caseId)) {
      await setChecklistItemStatus(paso.id, 'completed', abogadaId)
    }

    const historial = await listStatusHistory(caseId)
    const cierre = historial[historial.length - 1]
    expect(cierre.newStatus).toBe('completed')
    expect(cierre.reason).toBe('Ruta completada')
    // Sin este renglón el histórico no podría reconstruir cuándo se dejó de
    // trabajar el asunto.
    expect(cierre.changedBy).toBe(abogadaId)
  })

  it('los pasos "no aplica" no impiden el cierre, pero solos no lo provocan', async () => {
    const { caseId, abogadaId } = await crearCaso('Con pasos que no aplican')
    const pasos = await listChecklist(caseId)

    // TODOS en "no aplica": no se hizo el trabajo, así que no se cierra como
    // concluido —diría algo falso en las métricas del histórico.
    for (const paso of pasos) {
      await setChecklistItemStatus(paso.id, 'not_applicable', abogadaId)
    }
    expect((await listCases({ scope: 'closed' })).total).toBe(0)

    // Con uno solo completado, el resto sin aplicar, sí cierra.
    await setChecklistItemStatus(pasos[0].id, 'completed', abogadaId)
    expect((await listCases({ scope: 'closed' })).total).toBe(1)
  })

  it('no toca un caso ya cerrado por otro motivo', async () => {
    const { caseId, abogadaId } = await crearCaso('Se dio de baja antes')
    const pasos = await listChecklist(caseId)
    await setChecklistItemStatus(pasos[0].id, 'completed', abogadaId)
    await closeCase(caseId, { reason: 'client_declined' }, abogadaId)

    for (const paso of pasos.slice(1)) {
      await setChecklistItemStatus(paso.id, 'completed', abogadaId)
    }

    // El motivo real del cierre no se reescribe porque alguien ordene la ruta
    // después: en el histórico seguiría contando como "el cliente no continuó".
    const cerrados = await listCases({ scope: 'closed' })
    expect(cerrados.rows[0].closedReason).toBe('client_declined')
  })

  it('reabrir y volver a completar vuelve a cerrarlo', async () => {
    const { caseId, abogadaId } = await crearCaso('Reabierto')
    const pasos = await listChecklist(caseId)
    for (const paso of pasos) await setChecklistItemStatus(paso.id, 'completed', abogadaId)
    expect((await listCases({ scope: 'closed' })).total).toBe(1)

    await reopenCase(caseId, abogadaId, 'Faltaba una diligencia')
    expect((await listCases({ scope: 'open' })).total).toBe(1)

    await setChecklistItemStatus(pasos[0].id, 'pending', abogadaId)
    await setChecklistItemStatus(pasos[0].id, 'completed', abogadaId)
    expect((await listCases({ scope: 'closed' })).total).toBe(1)
  })

  it('cancela lo que quedaba agendado por delante', async () => {
    const { caseId, abogadaId } = await crearCaso('Con audiencia agendada')
    const pasos = await listChecklist(caseId)
    await updateChecklistItem(
      pasos[5].id,
      { dueAt: instantFrom(addDays(today(), 10), '10:00'), eventType: 'hearing' },
      abogadaId,
    )
    for (const paso of pasos) await setChecklistItemStatus(paso.id, 'completed', abogadaId)

    const eventos = await listEventsForCase(caseId)
    // Dejarlos vivos llenaría la agenda de citas de asuntos que ya no existen.
    expect(eventos.every((e) => e.status !== 'scheduled')).toBe(true)
  })
})
