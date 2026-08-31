/**
 * AVISOS AL DESPACHO.
 *
 * Une la configuración, el texto y el envío. Todo lo de aquí es "mejor esfuerzo":
 * si no hay clave, si el buzón falla o si Resend tarda, la función vuelve sin
 * ruido y la solicitud del prospecto queda guardada igual. Ese orden de
 * prioridades no es negociable — el caso de una persona no puede depender de un
 * proveedor de correo.
 *
 * Se ESPERA siempre (nunca se lanza sin await). En serverless, una petición que
 * sigue en vuelo cuando la respuesta ya salió se queda colgada al congelarse la
 * instancia, y ni se envía ni se entera nadie de que no se envió.
 */
import { alertRecipients, alertsEnabled, siteUrl } from '@/lib/config/avisos'
import { sendMail } from '@/lib/mail/send'
import {
  avisoCasoCalificado,
  avisoLlamadaAgendada,
  avisoLlamadaInmediata,
} from '@/lib/domain/aviso-texto'
import type { Aviso, AvisoLead } from '@/lib/domain/aviso-texto'
import type { Lead } from '@/lib/domain/types'

function paraAviso(lead: Lead): AvisoLead {
  return {
    folio: lead.folio,
    fullName: lead.fullName,
    phone: lead.phone,
    state: lead.state,
    dismissalDate: lead.dismissalDate,
    dismissalDaysAtSubmission: lead.dismissalDaysAtSubmission,
    description: lead.description,
  }
}

async function entregar(aviso: Aviso): Promise<void> {
  try {
    await sendMail({ to: alertRecipients(), subject: aviso.subject, text: aviso.text })
  } catch (error) {
    // sendMail ya se traga lo suyo; esto es el último cinturón, por si algo
    // revienta al componer los destinos.
    console.error('[aviso] fallo inesperado al avisar:', error)
  }
}

/** Entró un caso que pasa el filtro. */
export async function avisarCasoCalificado(lead: Lead): Promise<void> {
  if (!alertsEnabled()) return
  await entregar(avisoCasoCalificado(paraAviso(lead), lead.id, siteUrl()))
}

/** Pidió que le llamen en los próximos minutos: es el urgente. */
export async function avisarLlamadaInmediata(lead: Lead, minutos: number): Promise<void> {
  if (!alertsEnabled()) return
  await entregar(avisoLlamadaInmediata(paraAviso(lead), lead.id, siteUrl(), minutos))
}

/** Eligió día y hora. */
export async function avisarLlamadaAgendada(
  lead: Lead,
  dia: string,
  hora: string,
): Promise<void> {
  if (!alertsEnabled()) return
  await entregar(avisoLlamadaAgendada(paraAviso(lead), lead.id, siteUrl(), dia, hora))
}
