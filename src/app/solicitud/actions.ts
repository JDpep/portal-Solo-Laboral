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
import { ensureSeeded } from '@/lib/db'
import { createLead, findRecentSubmission, setCallPreference } from '@/lib/db/leads'
import { clientIp } from '@/lib/auth/session'
import { readLeadClaim, setLeadClaim } from '@/lib/auth/lead-claim'
import { LEAD_POLICY, checkRate, registerHit } from '@/lib/auth/rate-limit'
import { today } from '@/lib/dates'
import { qualifyLead } from '@/lib/domain/qualification'
import { parseCallPreference } from '@/lib/domain/call-time'
import { EMPTY_LEAD_VALUES, parseLeadForm, readLeadValues } from '@/lib/domain/lead-form'
import { HONEYPOT_FIELD, toUnqualifiedReason } from '@/lib/domain/lead-submission'
import type { LeadSubmissionState, ScheduleCallState } from '@/lib/domain/lead-submission'

/** Un reenvío del mismo teléfono y el mismo despido dentro de esta ventana
 *  no crea un registro nuevo: es la misma persona insistiendo. */
const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000

export async function submitLeadAction(
  _prev: LeadSubmissionState,
  formData: FormData,
): Promise<LeadSubmissionState> {
  await ensureSeeded()

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
    if (previous.qualificationStatus === 'qualified' && previous.caseNumber) {
      // Reenvío del mismo caso: se renueva el permiso para agendar, porque
      // muchas veces el reenvío ES el intento de volver a esa pantalla.
      setLeadClaim(previous.id)
      return { status: 'qualified', caseNumber: previous.caseNumber }
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

  if (lead.qualificationStatus === 'qualified' && lead.caseNumber) {
    // 7. Permiso temporal para elegir franja de llamada. Solo los calificados:
    //    a quien no pasó el filtro no se le ofrece la pantalla ni la cookie.
    setLeadClaim(lead.id)
    return { status: 'qualified', caseNumber: lead.caseNumber }
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
  await ensureSeeded()

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

  // El repositorio vuelve a exigir que el caso esté calificado; si la cookie
  // apuntara a otra cosa, aquí se acaba.
  const updated = await setCallPreference(leadId, parsed.data)
  if (!updated) {
    return {
      status: 'error',
      message:
        'No pudimos guardar el horario. Tu caso ya está registrado y un abogado te llamará de todos modos.',
    }
  }

  return { status: 'scheduled', preference: parsed.data }
}
