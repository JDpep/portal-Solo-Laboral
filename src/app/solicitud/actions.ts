'use server'

/**
 * Recepción del formulario público.
 *
 * Es el único punto donde entra información desde internet, así que aquí se
 * concentran las defensas: límite por IP, trampa para bots, detección de
 * envíos repetidos, validación y saneamiento. La decisión de negocio no se
 * toma aquí: se delega íntegra a `qualifyLead`, que es pura y probada aparte.
 *
 * Contra CSRF: las server actions de Next.js solo aceptan POST con Origin
 * coincidente con el Host, y el endpoint no es adivinable ni reutilizable
 * desde otro sitio. No hay ninguna acción de este proyecto que se dispare con
 * GET, así que no hace falta un token adicional.
 */
import {
  createLead,
  findRecentSubmission,
  markWhatsAppOpened,
  setCallPreference,
  setPreferredContactMethod,
  setQuickCall,
} from '@/lib/db/leads'
import { upsertWebCallEvent } from '@/lib/db/events'
import { recordAudit } from '@/lib/db/audit'
import { transaction } from '@/lib/db/sql'
import { quickCallDelayMinutes, whatsappNumber, whatsappTemplate } from '@/lib/config/contact'
import { buildWhatsAppMessage, buildWhatsAppUrl } from '@/lib/domain/whatsapp'
import { formatCallTime } from '@/lib/domain/call-time'
import { formatDateLong, instantFrom, today } from '@/lib/dates'
import { clientIp } from '@/lib/auth/session'
import { readLeadClaim, setLeadClaim } from '@/lib/auth/lead-claim'
import { LEAD_POLICY, checkRate, registerHit } from '@/lib/auth/rate-limit'
import { qualifyLead } from '@/lib/domain/qualification'
import { parseCallPreference } from '@/lib/domain/call-time'
import { EMPTY_LEAD_VALUES, parseLeadForm, readLeadValues } from '@/lib/domain/lead-form'
import { HONEYPOT_FIELD, toUnqualifiedReason } from '@/lib/domain/lead-submission'
import type {
  ContactOptions,
  LeadSubmissionState,
  QuickCallState,
  ScheduleCallState,
  WhatsAppState,
} from '@/lib/domain/lead-submission'
import type { Lead } from '@/lib/domain/types'

/** Un reenvío del mismo teléfono y el mismo despido dentro de esta ventana
 *  no crea un registro nuevo: es la misma persona insistiendo. */
const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000

export async function submitLeadAction(
  _prev: LeadSubmissionState,
  formData: FormData,
): Promise<LeadSubmissionState> {
  const values = readLeadValues(formData)

  // 1. Trampa para bots. No se guarda nada ni se dice por qué.
  if (typeof formData.get(HONEYPOT_FIELD) === 'string' && formData.get(HONEYPOT_FIELD) !== '') {
    return {
      status: 'blocked',
      message: 'No pudimos procesar tu solicitud. Vuelve a intentarlo.',
      values: EMPTY_LEAD_VALUES,
    }
  }

  // 2. Límite por IP, antes de gastar trabajo en validar.
  const rateKey = `lead|${clientIp() ?? 'sin-ip'}`
  const rate = checkRate(rateKey, LEAD_POLICY)
  if (!rate.allowed) {
    return {
      status: 'blocked',
      message: `Ya recibimos varias solicitudes desde esta conexión. Vuelve a intentarlo en ${Math.ceil(rate.retryAfterSeconds / 60)} minutos.`,
      values,
    }
  }

  // 3. Validación y saneamiento. La fecha civil de CDMX manda en todo el flujo.
  const submittedOn = today()
  const parsed = parseLeadForm(values, submittedOn)
  if (!parsed.ok) {
    registerHit(rateKey)
    return {
      status: 'invalid',
      fieldErrors: parsed.fieldErrors,
      values,
      message: 'Revisa los datos marcados para poder enviar tu solicitud.',
    }
  }

  registerHit(rateKey)

  // 4. Envío repetido: se responde igual que la primera vez, sin duplicar.
  const previous = await findRecentSubmission(
    parsed.data.phone,
    parsed.data.dismissalDate,
    DUPLICATE_WINDOW_MS,
  )
  if (previous) {
    if (previous.qualificationStatus === 'qualified' && previous.folio) {
      // Reenvío del mismo caso: se renueva el permiso para agendar, porque
      // muchas veces el reenvío ES el intento de volver a esa pantalla.
      setLeadClaim(previous.id)
      return { status: 'qualified', folio: previous.folio, contact: contactOptions(previous) }
    }
    // El motivo guardado se calculó con la fecha del PRIMER envío; es el mismo
    // que ya se le mostró a esta persona hace un momento.
    return { status: 'unqualified', reason: toUnqualifiedReason(previous.qualificationReason) }
  }

  // 5. Motor de calificación. Determinístico, sin IA, del lado del servidor.
  const verdict = qualifyLead({
    state: parsed.data.state,
    dismissalDate: parsed.data.dismissalDate,
    submittedOn,
  })

  // 6. Se guarda SIEMPRE, califique o no. Lo que cambia es quién puede verlo:
  //    el portal de abogados solo lee los `qualified`.
  const lead = await createLead({
    ...parsed.data,
    submittedOn,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })

  if (lead.qualificationStatus === 'qualified' && lead.folio) {
    // 7. Permiso temporal para elegir hora de llamada. Solo los calificados:
    //    a quien no pasó el filtro no se le ofrece la pantalla ni la cookie.
    setLeadClaim(lead.id)
    return { status: 'qualified', folio: lead.folio, contact: contactOptions(lead) }
  }
  return { status: 'unqualified', reason: toUnqualifiedReason(lead.qualificationReason) }
}

/**
 * FRANJA PARA LA LLAMADA.
 *
 * Solo puede llegar aquí quien acaba de enviar un formulario que calificó: la
 * autorización es la cookie firmada de `lead-claim`, no un id que venga en el
 * formulario. Si no hay cookie o ya caducó, no se busca nada — no existe forma
 * de pedir "agenda para el caso X".
 *
 * Es un paso opcional: si algo falla, el mensaje lo dice sin sugerir jamás que
 * la solicitud se perdió, porque no se perdió.
 */
export async function scheduleCallAction(
  _prev: ScheduleCallState,
  formData: FormData,
): Promise<ScheduleCallState> {
  const leadId = readLeadClaim()
  if (!leadId) {
    return {
      status: 'error',
      message:
        'Pasó demasiado tiempo para elegir un horario desde aquí. No te preocupes: tu caso ya está registrado y un abogado te llamará.',
    }
  }

  const rateKey = `agenda|${clientIp() ?? 'sin-ip'}`
  const rate = checkRate(rateKey, LEAD_POLICY)
  if (!rate.allowed) {
    return {
      status: 'error',
      message: `Demasiados intentos desde esta conexión. Vuelve a intentarlo en ${Math.ceil(rate.retryAfterSeconds / 60)} minutos.`,
    }
  }
  registerHit(rateKey)

  const parsed = parseCallPreference(formData.get('callDate'), formData.get('callTime'), today())
  if (!parsed.ok) return { status: 'error', message: parsed.message }

  /*
   * Las tres escrituras van juntas o no va ninguna: la hora en el lead, la
   * llamada en el calendario del despacho y el rastro en la bitácora. Si el
   * evento fallara por su cuenta, la persona vería "listo, te llamamos el
   * jueves" y en la agenda del abogado no habría nada.
   *
   * El repositorio vuelve a exigir que el lead sea visible; si la cookie
   * apuntara a otra cosa, aquí se acaba.
   */
  const updated = await transaction(async () => {
    const lead = await setCallPreference(leadId, parsed.data)
    if (!lead) return null

    await setPreferredContactMethod(lead.id, 'scheduled_call')
    // La persona eligió "el jueves a las 16:20" en hora de Ciudad de México;
    // el calendario guarda instantes. La conversión pasa por la zona del
    // despacho para que la llamada no salga corrida en la agenda según dónde
    // viva el servidor que atendió la petición.
    await upsertWebCallEvent({
      leadId: lead.id,
      startAt: instantFrom(parsed.data.date, parsed.data.time),
      title: `Llamada agendada · ${lead.fullName}`,
      description: `Pidió que le llamaran el ${formatDateLong(parsed.data.date)} a las ${formatCallTime(parsed.data.time)}. Es una preferencia, no una cita confirmada. Folio ${lead.folio ?? '—'}.`,
    })
    await recordAudit({
      userId: null,
      action: 'lead_contact_method_set',
      entity: 'lead',
      entityId: lead.id,
      after: {
        userType: 'prospect',
        folio: lead.folio,
        method: 'scheduled_call',
        preference: parsed.data,
      },
      ip: clientIp(),
    })
    return lead
  })

  if (!updated) {
    return {
      status: 'error',
      message:
        'No pudimos guardar el horario. Tu caso ya está registrado y un abogado te llamará de todos modos.',
    }
  }

  return { status: 'scheduled', preference: parsed.data }
}

/**
 * Las vías de contacto que se le ofrecen a quien acaba de calificar.
 *
 * El enlace de WhatsApp se arma AQUÍ, en el servidor, con el número que sale
 * de la configuración y con los datos que la persona ya dio. El navegador
 * recibe una URL terminada y lo único que hace es abrirla.
 *
 * NO lleva la descripción del caso: ese texto puede traer nombres de terceros,
 * salarios o detalles que no hacen falta para empezar a hablar, y un mensaje
 * de WhatsApp ya no se recoge. El abogado lo lee completo en la ficha,
 * buscando el folio.
 */
function contactOptions(lead: Lead): ContactOptions {
  const number = whatsappNumber()
  const url =
    number && lead.folio
      ? buildWhatsAppUrl(
          number,
          buildWhatsAppMessage(
            {
              fullName: lead.fullName,
              state: lead.state,
              dismissalDaysAtSubmission: lead.dismissalDaysAtSubmission,
              folio: lead.folio,
            },
            whatsappTemplate(),
          ),
        )
      : null

  return { whatsappUrl: url, quickCallWindow: quickCallDelayMinutes() }
}

/**
 * ABRIÓ WHATSAPP.
 *
 * Autoriza la MISMA cookie firmada que usa agendar: no llega ningún id desde
 * el formulario, así que nadie puede registrar actividad sobre la solicitud de
 * otra persona. Y no crea nada — ni lead, ni folio, ni caso: todo sigue
 * colgando del mismo registro.
 *
 * Lo que se guarda es "abrió", nunca "envió". El sistema pierde de vista a la
 * persona en cuanto salta a WhatsApp: no sabe si mandó el mensaje, si lo pensó
 * mejor o si se quedó sin batería. El día que exista WhatsApp Business API y
 * llegue confirmación real, eso se guardará aparte y con otro nombre.
 */
export async function openWhatsAppAction(): Promise<WhatsAppState> {
  const leadId = readLeadClaim()
  // El fallo aquí NO puede leerse como que la solicitud se perdió: no se
  // perdió, y la persona puede escribir por WhatsApp igual.
  if (!leadId) return { status: 'idle' }

  const updated = await transaction(async () => {
    const lead = await markWhatsAppOpened(leadId)
    if (!lead) return null
    await recordAudit({
      userId: null,
      action: 'lead_whatsapp_opened',
      entity: 'lead',
      entityId: lead.id,
      after: {
        userType: 'prospect',
        folio: lead.folio,
        source: 'qualification_success',
        // A propósito: abrir no es enviar, y la bitácora tiene que poder
        // distinguirlo cuando alguien la lea dentro de seis meses.
        whatsappOpenedAt: lead.whatsappOpenedAt,
        messageSent: null,
      },
      ip: clientIp(),
    })
    return lead
  })

  return updated ? { status: 'idle' } : { status: 'idle' }
}

/**
 * LLAMADA PRÓXIMA — "prefiero que me llamen".
 *
 * Guarda la preferencia y agenda la llamada en el calendario del despacho, en
 * el MÍNIMO de la ventana prometida: más vale que el abogado la vea un poco
 * antes de los diez minutos que un poco después de los quince.
 *
 * Reutiliza el mismo hueco de calendario que "agendar llamada" —hay un índice
 * único que lo garantiza—, así que cambiar de opinión mueve la llamada en vez
 * de duplicarla.
 */
export async function requestQuickCallAction(): Promise<QuickCallState> {
  const leadId = readLeadClaim()
  if (!leadId) {
    return {
      status: 'error',
      message:
        'Pasó demasiado tiempo para pedirlo desde aquí. No te preocupes: tu caso ya está registrado y un abogado te llamará.',
    }
  }

  const rateKey = `contacto|${clientIp() ?? 'sin-ip'}`
  const rate = checkRate(rateKey, LEAD_POLICY)
  if (!rate.allowed) {
    return {
      status: 'error',
      message: `Demasiados intentos desde esta conexión. Vuelve a intentarlo en ${Math.ceil(rate.retryAfterSeconds / 60)} minutos.`,
    }
  }
  registerHit(rateKey)

  const window = quickCallDelayMinutes()
  const startAt = new Date(Date.now() + window.min * 60_000).toISOString()

  const lead = await transaction(async () => {
    const updated = await setQuickCall(leadId, startAt)
    if (!updated) return null
    await upsertWebCallEvent({
      leadId: updated.id,
      startAt,
      title: `Llamada próxima · ${updated.fullName}`,
      description: `Pidió que le llamaran enseguida (ventana de ${window.min} a ${window.max} minutos). Folio ${updated.folio ?? '—'}.`,
    })
    await recordAudit({
      userId: null,
      action: 'lead_quick_call_requested',
      entity: 'lead',
      entityId: updated.id,
      after: { userType: 'prospect', folio: updated.folio, scheduledCallAt: startAt, window },
      ip: clientIp(),
    })
    return updated
  })

  if (!lead) {
    return {
      status: 'error',
      message:
        'No pudimos registrar tu solicitud de llamada. Tu caso ya está registrado y un abogado te llamará de todos modos.',
    }
  }
  return { status: 'requested', window }
}
