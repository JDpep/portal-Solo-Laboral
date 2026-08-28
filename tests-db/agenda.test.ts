import { beforeEach, describe, expect, it } from 'vitest'
import { crearAbogado, resetDb } from './helpers'
import { createLead } from '@/lib/db/leads'
import { closeCase, convertLeadToCase } from '@/lib/db/cases'
import { listChecklist, setChecklistItemStatus, updateChecklistItem } from '@/lib/db/checklist'
import {
  cancelEvent,
  createEvent,
  listAgenda,
  listEventsForCase,
  listOverdue,
  setEventDone,
  upsertWebCallEvent,
} from '@/lib/db/events'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, instantFrom, today } from '@/lib/dates'

/**
 * LA AGENDA SE ALIMENTA SOLA.
 *
 * Lo que se afirma aquí lo garantiza un TRIGGER de la base, no la aplicación, y
 * esa es exactamente la razón de probarlo contra Postgres de verdad: contra un
 * doble en memoria estas pruebas pasarían sin haber ejercitado nada.
 *
 * Tres vías llenan la agenda y la diferencia importa: la llamada que pide el
 * prospecto desde la web y la fecha de un paso de la ruta son un REFLEJO de algo
 * que vive en otro sitio, así que no se cierran ni se cancelan desde la agenda;
 * la actividad capturada a mano no refleja nada y sí. Media suite se dedica a
 * comprobar que esa frontera aguanta.
 */
async function crearCasoConRuta() {
  const hoy = today()
  const dismissalDate = addDays(hoy, -20)
  const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })

  const lead = await createLead({
    fullName: 'Juan Pérez Villanueva',
    phone: '5512345678',
    state: 'CMX',
    dismissalDate,
    description: 'Me despidieron sin liquidación.',
    submittedOn: hoy,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })

  const abogada = await crearAbogado()
  const result = await convertLeadToCase(lead.id, abogada.id)
  if (!result.ok) throw new Error(`no se pudo convertir: ${result.code}`)

  const items = await listChecklist(result.caseId)
  return { lead, abogada, caseId: result.caseId, items }
}

/** Rango que abarca cualquier fecha que use esta suite. */
function rangoAmplio() {
  const hoy = today()
  return { from: instantFrom(addDays(hoy, -60), '00:00'), to: instantFrom(addDays(hoy, 60), '00:00') }
}

describe('la ruta del caso alimenta la agenda', () => {
  beforeEach(resetDb)

  it('poner fecha a un paso crea el evento; no ponerla no crea nada', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()

    // Convertir copia ocho pasos y NINGUNO trae fecha: un caso recién abierto
    // no debe ensuciar la agenda con ocho pendientes inventados.
    expect(items.length).toBeGreaterThan(0)
    expect(await listEventsForCase(caseId)).toHaveLength(0)

    const audiencia = items[5]
    const cuando = instantFrom(addDays(today(), 3), '10:30')
    await updateChecklistItem(audiencia.id, { dueAt: cuando, eventType: 'hearing' }, abogada.id)

    const eventos = await listEventsForCase(caseId)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].eventType).toBe('hearing')
    expect(eventos[0].title).toBe(audiencia.title)
    expect(eventos[0].startAt).toBe(cuando)
    expect(eventos[0].status).toBe('scheduled')
    // Nació de un paso, y el evento lo dice: es lo que impide cerrarlo por
    // la puerta de la agenda.
    expect(eventos[0].checklistItemId).toBe(audiencia.id)
    expect(eventos[0].source).toBe('system')
  })

  it('mover la fecha tres veces deja UN evento, no tres', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    const paso = items[5]

    for (const dias of [3, 5, 9]) {
      await updateChecklistItem(
        paso.id,
        { dueAt: instantFrom(addDays(today(), dias), '10:30'), eventType: 'hearing' },
        abogada.id,
      )
    }

    const eventos = await listEventsForCase(caseId)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].startAt).toBe(instantFrom(addDays(today(), 9), '10:30'))
  })

  it('quitar la fecha cancela el evento en vez de borrarlo', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    const paso = items[1]

    await updateChecklistItem(
      paso.id,
      { dueAt: instantFrom(addDays(today(), 2), '12:00') },
      abogada.id,
    )
    await updateChecklistItem(paso.id, { dueAt: null }, abogada.id)

    const eventos = await listEventsForCase(caseId)
    // Sigue estando: nada se borra. Pero cancelado, y con su fecha de cancelación.
    expect(eventos).toHaveLength(1)
    expect(eventos[0].status).toBe('cancelled')
    expect(eventos[0].cancelledAt).not.toBeNull()

    // Y ya no sale en la agenda, que es lo que importa a quien la mira.
    const agenda = await listAgenda(rangoAmplio())
    expect(agenda.some((e) => e.id === eventos[0].id)).toBe(false)
  })

  it('completar el paso marca su evento como realizado', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    const paso = items[1]

    await updateChecklistItem(
      paso.id,
      { dueAt: instantFrom(addDays(today(), 1), '09:00') },
      abogada.id,
    )
    await setChecklistItemStatus(paso.id, 'completed', abogada.id)

    const eventos = await listEventsForCase(caseId)
    expect(eventos[0].status).toBe('done')
  })

  it('marcar el paso "no aplica" cancela su evento', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    const paso = items[2]

    await updateChecklistItem(
      paso.id,
      { dueAt: instantFrom(addDays(today(), 1), '09:00') },
      abogada.id,
    )
    await setChecklistItemStatus(paso.id, 'not_applicable', abogada.id)

    const eventos = await listEventsForCase(caseId)
    expect(eventos[0].status).toBe('cancelled')
  })

  it('un evento que nació de un paso no se puede cerrar desde la agenda', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    const paso = items[3]

    await updateChecklistItem(
      paso.id,
      { dueAt: instantFrom(addDays(today(), 1), '09:00') },
      abogada.id,
    )
    const [evento] = await listEventsForCase(caseId)

    // La consulta lo rechaza: no devuelve nada y no toca la fila. Si se pudiera,
    // la agenda diría "realizado" mientras la ruta del caso dice "pendiente".
    expect(await setEventDone(evento.id, true)).toBeNull()
    expect((await listEventsForCase(caseId))[0].status).toBe('scheduled')
  })

  it('cerrar el caso cancela lo que quedaba agendado por delante', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()

    await updateChecklistItem(
      items[4].id,
      { dueAt: instantFrom(addDays(today(), 6), '11:00') },
      abogada.id,
    )
    await closeCase(caseId, { reason: 'client_declined' }, abogada.id)

    const eventos = await listEventsForCase(caseId)
    expect(eventos[0].status).toBe('cancelled')
  })
})

describe('la agenda', () => {
  beforeEach(resetDb)

  it('trae el nombre y el folio del cliente con cada evento', async () => {
    const { items, abogada, lead } = await crearCasoConRuta()
    await updateChecklistItem(
      items[0].id,
      { dueAt: instantFrom(addDays(today(), 1), '09:00') },
      abogada.id,
    )

    const agenda = await listAgenda(rangoAmplio())
    expect(agenda).toHaveLength(1)
    // Sin esto, la agenda sería una lista de "Audiencia · 10:30" sin dueño.
    expect(agenda[0].clientName).toBe(lead.fullName)
    expect(agenda[0].folio).toBe(lead.folio)
    expect(agenda[0].phone).toBe(lead.phone)
  })

  it('el rango es semiabierto: un evento no sale en dos días seguidos', async () => {
    const { items, abogada } = await crearCasoConRuta()
    const dia = addDays(today(), 4)
    await updateChecklistItem(items[0].id, { dueAt: instantFrom(dia, '00:00') }, abogada.id)

    const delDia = await listAgenda({
      from: instantFrom(dia, '00:00'),
      to: instantFrom(addDays(dia, 1), '00:00'),
    })
    const delAnterior = await listAgenda({
      from: instantFrom(addDays(dia, -1), '00:00'),
      to: instantFrom(dia, '00:00'),
    })

    expect(delDia).toHaveLength(1)
    expect(delAnterior).toHaveLength(0)
  })

  it('lo que ya pasó y sigue agendado sale como atrasado', async () => {
    const { items, abogada } = await crearCasoConRuta()
    const ayer = instantFrom(addDays(today(), -1), '10:00')
    await updateChecklistItem(items[0].id, { dueAt: ayer }, abogada.id)

    const atrasados = await listOverdue(new Date().toISOString())
    expect(atrasados).toHaveLength(1)

    // En cuanto se completa el paso, deja de estar atrasado.
    await setChecklistItemStatus(items[0].id, 'completed', abogada.id)
    expect(await listOverdue(new Date().toISOString())).toHaveLength(0)
  })

  it('la llamada pedida desde la web entra en la agenda sin pasar por un caso', async () => {
    const hoy = today()
    const dismissalDate = addDays(hoy, -10)
    const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })
    const lead = await createLead({
      fullName: 'María Fernanda Solís',
      phone: '5528461130',
      state: 'CMX',
      dismissalDate,
      description: '',
      submittedOn: hoy,
      qualificationStatus: verdict.status,
      qualificationReason: verdict.reason,
      dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
    })

    await upsertWebCallEvent({
      leadId: lead.id,
      startAt: instantFrom(addDays(hoy, 1), '16:20'),
      title: `Llamada agendada · ${lead.fullName}`,
    })

    const agenda = await listAgenda(rangoAmplio())
    expect(agenda).toHaveLength(1)
    expect(agenda[0].clientName).toBe('María Fernanda Solís')
    expect(agenda[0].checklistItemId).toBeNull()

    // Esta sí se cierra desde la agenda: no hay ningún paso que la respalde.
    expect(await setEventDone(agenda[0].id, true)).not.toBeNull()
    expect((await listAgenda(rangoAmplio()))[0].status).toBe('done')
  })
})

describe('actividades capturadas a mano', () => {
  beforeEach(resetDb)

  it('se guardan ligadas a un caso y heredan su cliente y su folio', async () => {
    const { caseId, abogada, lead } = await crearCasoConRuta()

    await createEvent(
      {
        title: 'Junta con el cliente',
        eventType: 'meeting',
        startAt: instantFrom(addDays(today(), 2), '11:00'),
        caseId,
        description: 'En el despacho.',
      },
      abogada.id,
    )

    const agenda = await listAgenda(rangoAmplio())
    expect(agenda).toHaveLength(1)
    expect(agenda[0].eventType).toBe('meeting')
    expect(agenda[0].source).toBe('manual')
    // Ligarla al caso es lo que le da nombre y folio en la agenda.
    expect(agenda[0].clientName).toBe(lead.fullName)
    expect(agenda[0].folio).toBe(lead.folio)
    // No nació de un paso, así que se puede cerrar desde la agenda.
    expect(agenda[0].checklistItemId).toBeNull()
  })

  it('sin caso, la actividad queda a nombre de quien la crea', async () => {
    const { abogada } = await crearCasoConRuta()

    const creado = await createEvent(
      {
        title: 'Junta interna del despacho',
        eventType: 'meeting',
        startAt: instantFrom(addDays(today(), 1), '09:00'),
      },
      abogada.id,
    )

    // La base exige que todo evento tenga dueño: una cita que no es de nadie
    // no le sirve a nadie y no vuelve a encontrarse.
    expect(creado!.assignedUserId).toBe(abogada.id)
    expect(creado!.caseId).toBeNull()

    const agenda = await listAgenda(rangoAmplio())
    expect(agenda[0].clientName).toBeNull()
    expect(agenda[0].assignedUserName).toBe(abogada.name)
  })

  it('respeta al responsable elegido cuando se indica', async () => {
    const { abogada } = await crearCasoConRuta()
    const otra = await crearAbogado('Otra abogada')

    const creado = await createEvent(
      {
        title: 'Diligencia',
        eventType: 'other',
        startAt: instantFrom(addDays(today(), 1), '09:00'),
        assignedUserId: otra.id,
      },
      abogada.id,
    )
    expect(creado!.assignedUserId).toBe(otra.id)
    expect(creado!.createdBy).toBe(abogada.id)
  })

  it('se marca realizada y se cancela desde la agenda', async () => {
    const { caseId, abogada } = await crearCasoConRuta()
    await createEvent(
      {
        title: 'Llamada de cortesía',
        eventType: 'call',
        startAt: instantFrom(addDays(today(), 1), '13:00'),
        caseId,
      },
      abogada.id,
    )
    const [evento] = await listAgenda(rangoAmplio())

    expect(await setEventDone(evento.id, true)).not.toBeNull()
    expect((await listAgenda(rangoAmplio()))[0].status).toBe('done')

    await setEventDone(evento.id, false)
    expect(await cancelEvent(evento.id)).not.toBeNull()
    // Cancelada sale de la agenda pero no se borra: sigue siendo el registro
    // de lo que se había previsto y no ocurrió.
    expect(await listAgenda(rangoAmplio())).toHaveLength(0)
    expect((await listEventsForCase(caseId))[0].status).toBe('cancelled')
  })

  it('cancelar NO alcanza a un evento nacido de un paso de la ruta', async () => {
    const { caseId, items, abogada } = await crearCasoConRuta()
    await updateChecklistItem(
      items[5].id,
      { dueAt: instantFrom(addDays(today(), 3), '10:30'), eventType: 'hearing' },
      abogada.id,
    )
    const [evento] = await listEventsForCase(caseId)

    // Se quita borrándole la fecha al paso, no desde la agenda: si se pudiera
    // por las dos puertas, la ruta seguiría diciendo que hay audiencia.
    expect(await cancelEvent(evento.id)).toBeNull()
    expect((await listEventsForCase(caseId))[0].status).toBe('scheduled')
  })

  it('una actividad ligada aparece en la agenda del caso', async () => {
    const { caseId, abogada } = await crearCasoConRuta()
    await createEvent(
      {
        title: 'Entrega de documentos',
        eventType: 'other',
        startAt: instantFrom(addDays(today(), 4), '17:00'),
        caseId,
      },
      abogada.id,
    )
    const delCaso = await listEventsForCase(caseId)
    expect(delCaso).toHaveLength(1)
    expect(delCaso[0].title).toBe('Entrega de documentos')
  })
})
