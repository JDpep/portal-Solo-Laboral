/**
 * MENSAJE PRELLENADO DE WHATSAPP.
 *
 * Funciones puras. Construyen el texto y el enlace a partir de datos que la
 * persona YA dio: no hay IA de por medio, es una plantilla — el mensaje tiene
 * que ser previsible, revisable y el mismo para todos.
 *
 * QUÉ VA Y QUÉ NO. Van cuatro cosas: nombre, entidad, días desde el despido y
 * folio. NO va la descripción de lo que pasó, aunque el sistema la tenga: ese
 * texto lo escribió alguien el peor día de su año, puede contener nombres de
 * terceros, salarios o detalles que no hacen falta para abrir una conversación
 * — y una vez enviado por WhatsApp ya no se puede recoger. El abogado lo lee
 * completo en la ficha del lead, buscando el folio.
 *
 * El FOLIO es lo que convierte un WhatsApp suelto en un caso con historia: el
 * abogado lo teclea en el portal y tiene delante todo lo que la persona
 * contestó, su hora pedida y su calendario.
 */
import type { PlainDate } from '@/lib/dates'
import { stateLabel } from '@/lib/domain/states'
import type { StateCode } from '@/lib/domain/states'

export interface WhatsAppMessageInput {
  fullName: string
  state: StateCode
  /**
   * Días CONGELADOS al momento del envío. No se recalculan: si el mensaje se
   * armara con el número de hoy, alguien que llenó el formulario el martes y
   * escribe el jueves diría dos días de más, y ese número es justo el que
   * decide si el despacho puede tomar el caso.
   */
  dismissalDaysAtSubmission: number
  folio: string
}

/** Sustituye los marcadores de la plantilla. Nada más. */
export function buildWhatsAppMessage(input: WhatsAppMessageInput, template: string): string {
  const days = Math.max(0, Math.trunc(input.dismissalDaysAtSubmission))
  return template
    .replaceAll('{full_name}', input.fullName.trim())
    .replaceAll('{state_label}', stateLabel(input.state))
    .replaceAll('{dismissal_days}', String(days))
    .replaceAll('{folio}', input.folio)
}

/**
 * Enlace a la conversación. `wa.me` es el mecanismo oficial y resuelve solo
 * los dos casos: abre la aplicación en el teléfono y WhatsApp Web en el
 * escritorio, sin que haya que detectar el aparato.
 *
 * El número llega SIEMPRE de la configuración del servidor y el texto va
 * codificado con `encodeURIComponent`, así que ni un salto de línea ni un
 * ampersand en el nombre pueden partir la URL ni colar un parámetro extra.
 */
export function buildWhatsAppUrl(number: string, message: string): string {
  const digits = number.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('El número de WhatsApp del despacho no es válido.')
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** Enlace para escribirle AL PROSPECTO desde el portal. Otra dirección. */
export function buildStaffWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/52${digits}`
}

/** Los datos que necesita el mensaje, tal como los guarda un lead. */
export interface WhatsAppSource {
  fullName: string
  state: StateCode
  dismissalDate: PlainDate
  dismissalDaysAtSubmission: number
  folio: string | null
}
