/**
 * EL TEXTO DE LOS AVISOS AL DESPACHO.
 *
 * Puro y AJENO AL TRANSPORTE, para poder probarlo sin enviar nada. Sirve igual
 * para un WhatsApp que para cualquier otro canal: los dos son texto plano y en
 * los dos la primera línea es lo único que se lee en la notificación.
 *
 * DOS PRINCIPIOS:
 *
 *  · El TITULAR tiene que bastar. Se lee en la pantalla de bloqueo, de pie,
 *    entre dos cosas. Por eso lleva el nombre y —cuando corre prisa— empieza
 *    diciendo que corre prisa, en vez de un "Nuevo lead" que obliga a abrir para
 *    saber si hay que moverse.
 *
 *  · El CUERPO lleva lo justo para actuar: a quién llamar y a qué número. Meter
 *    el relato del despido en un mensaje sería sacar el dato más sensible del
 *    expediente hacia un teléfono que nadie administra —y un WhatsApp enviado no
 *    se recoge—. Para eso está el portal, y va enlazado.
 *
 * NO se promete nada que el despacho no haya decidido: "cumple los criterios",
 * nunca "caso aceptado". Es el mismo cuidado que en el mensaje al prospecto.
 */
import { formatDate, formatDateLong } from '@/lib/dates'
import { formatPhone } from '@/lib/domain/phone'
import { stateLabel } from '@/lib/domain/states'
import type { StateCode } from '@/lib/domain/states'

export interface AvisoLead {
  folio: string | null
  fullName: string
  phone: string
  state: StateCode
  dismissalDate: string
  dismissalDaysAtSubmission: number
  description: string
}

export interface Aviso {
  /** Primera línea: lo único que se ve sin abrir la notificación. */
  titular: string
  cuerpo: string
}

function pie(url: string, leadId: string): string {
  const enlace = url ? `\n\nAbrir en el portal:\n${url}/portal/${leadId}` : ''
  return `${enlace}\n\n—\nAviso automático del portal de Solo Laboral.`
}

function ficha(lead: AvisoLead): string {
  return [
    `Nombre:   ${lead.fullName}`,
    `Teléfono: ${formatPhone(lead.phone)}`,
    `Estado:   ${stateLabel(lead.state)}`,
    `Despido:  ${formatDate(lead.dismissalDate)} (hace ${lead.dismissalDaysAtSubmission} días)`,
    `Folio:    ${lead.folio ?? '—'}`,
  ].join('\n')
}

/** Entró un caso que pasa el filtro. */
export function avisoCasoCalificado(
  lead: AvisoLead,
  leadId: string,
  siteUrl: string,
): Aviso {
  return {
    titular: `Caso calificado: ${lead.fullName}`,
    cuerpo:
      `Entró una solicitud que cumple los criterios iniciales de revisión.\n\n` +
      `${ficha(lead)}\n\n` +
      `${lead.description ? 'Escribió una descripción; está en el portal.' : 'No escribió descripción: conviene preguntarlo en la llamada.'}` +
      pie(siteUrl, leadId),
  }
}

/**
 * PIDIÓ QUE LE LLAMEN YA.
 *
 * Este es el aviso que justifica todo el mecanismo. El formulario le dijo a esa
 * persona que la llamarían en unos minutos; si nadie se entera, el sistema
 * acaba de prometer algo en nombre del despacho que nadie va a cumplir. Por eso
 * el asunto empieza por la acción y no por el hecho.
 */
export function avisoLlamadaInmediata(
  lead: AvisoLead,
  leadId: string,
  siteUrl: string,
  minutos: number,
): Aviso {
  return {
    titular: `LLAMAR AHORA (${minutos} min): ${lead.fullName} · ${formatPhone(lead.phone)}`,
    cuerpo:
      `Pidió que le llamaran en los próximos ${minutos} minutos y la pantalla se lo prometió.\n\n` +
      `${ficha(lead)}` +
      pie(siteUrl, leadId),
  }
}

/** Eligió día y hora. No corre prisa hoy, pero tiene que quedar anotado. */
export function avisoLlamadaAgendada(
  lead: AvisoLead,
  leadId: string,
  siteUrl: string,
  dia: string,
  hora: string,
): Aviso {
  return {
    titular: `Llamada pedida para ${formatDate(dia)} ${hora} · ${lead.fullName}`,
    cuerpo:
      `Pidió que le llamaran el ${formatDateLong(dia)} a las ${hora}.\n` +
      `Es una preferencia del prospecto, no una cita confirmada por el despacho.\n\n` +
      `${ficha(lead)}` +
      pie(siteUrl, leadId),
  }
}
