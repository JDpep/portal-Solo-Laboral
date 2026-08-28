/**
 * ETIQUETAS EN ESPAÑOL de los estados del sistema.
 *
 * La base guarda claves estables en inglés ('waiting_client'); la pantalla
 * muestra texto en español. Traducir aquí, en un solo sitio, evita que la
 * misma clave acabe con tres redacciones distintas según quién escribiera la
 * pantalla — y permite cambiar el vocabulario del despacho sin migrar datos.
 *
 * El TONO nunca viaja solo: cada estado se pinta con texto y color, nunca solo
 * con color. Quien no distingue el verde del ámbar tiene que poder leerlo.
 */
import type {
  CaseCloseReason,
  ContactMethod,
  CaseStatus,
  ChecklistItemStatus,
  EventStatus,
  EventType,
  LeadSource,
  LeadStatus,
  StaffRole,
} from '@/lib/domain/types'

export type Tone = 'neutral' | 'primary' | 'info' | 'success' | 'warning'

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  active: 'Activo',
  waiting_client: 'Esperando cliente',
  scheduled: 'Evento agendado',
  in_process: 'En proceso',
  completed: 'Completado',
  discontinued: 'Sin seguimiento',
  archived: 'Archivado',
}

export const CASE_STATUS_TONE: Record<CaseStatus, Tone> = {
  active: 'primary',
  waiting_client: 'warning',
  scheduled: 'info',
  in_process: 'info',
  completed: 'success',
  discontinued: 'neutral',
  archived: 'neutral',
}

/** Los estados en los que el caso sigue pidiendo trabajo. */
export const OPEN_CASE_STATUSES: CaseStatus[] = [
  'active',
  'waiting_client',
  'scheduled',
  'in_process',
]

export const CASE_CLOSE_REASON_LABEL: Record<CaseCloseReason, string> = {
  completed: 'Caso concluido',
  client_declined: 'El cliente decidió no continuar',
  client_unresponsive: 'El cliente dejó de responder',
  not_viable: 'No procedió después de la revisión',
  other: 'Otro motivo',
}

/**
 * El mismo motivo, en corto.
 *
 * La versión larga es una frase —"El cliente decidió no continuar"— y sirve
 * para leerla en la ficha de un caso, donde hay renglón entero. En una columna
 * de tabla o en una pastilla de filtro no cabe, y recortarla con puntos
 * suspensivos deja al lector adivinando cuál de los dos motivos de cliente era.
 */
export const CASE_CLOSE_REASON_SHORT: Record<CaseCloseReason, string> = {
  completed: 'Concluido',
  client_declined: 'No continuó',
  client_unresponsive: 'Sin respuesta',
  not_viable: 'No procedió',
  other: 'Otro',
}

/**
 * El tono NO califica al despacho: que un cliente deje de responder no es un
 * error de nadie. Solo separa el cierre que llegó a término del que no.
 */
export const CASE_CLOSE_REASON_TONE: Record<CaseCloseReason, Tone> = {
  completed: 'success',
  client_declined: 'neutral',
  client_unresponsive: 'warning',
  not_viable: 'info',
  other: 'neutral',
}

export const CHECKLIST_STATUS_LABEL: Record<ChecklistItemStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En proceso',
  completed: 'Completado',
  not_applicable: 'No aplica',
}

/**
 * "Sin respuesta" y NO "No respondió".
 *
 * La clave de la base sigue siendo `no_response`, pero el rótulo cambió cuando
 * el estado empezó a ponerse solo: pasados unos días sin novedad, el sistema no
 * sabe quién se quedó callado. Si nadie marcó ese teléfono, el que no respondió
 * fue el despacho. "No respondió" señala al prospecto de algo que puede no
 * haber hecho; "Sin respuesta" describe el hecho —no hay respuesta— y es cierto
 * en los dos casos.
 */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido en caso',
  discarded: 'Descartado',
  no_response: 'Sin respuesta',
}

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'primary',
  contacted: 'info',
  converted: 'success',
  discarded: 'neutral',
  no_response: 'warning',
}

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  web_form: 'Formulario web',
  manual: 'Alta manual',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  other: 'Otro',
}

/**
 * Vías de contacto, como las lee el abogado en la ficha.
 *
 * "Pidió WhatsApp" y no "WhatsApp": el rótulo tiene que recordar que es lo que
 * la persona eligió, no algo que el despacho ya hizo.
 */
export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = {
  whatsapp: 'WhatsApp',
  scheduled_call: 'Llamada agendada',
  quick_call: 'Llamada próxima',
}

export const CONTACT_METHOD_TONE: Record<ContactMethod, Tone> = {
  whatsapp: 'success',
  scheduled_call: 'info',
  quick_call: 'warning',
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  call: 'Llamada',
  hearing: 'Audiencia',
  conciliation: 'Conciliación',
  meeting: 'Junta',
  follow_up: 'Seguimiento',
  deadline: 'Fecha límite',
  other: 'Otro',
}

export const EVENT_TYPE_TONE: Record<EventType, Tone> = {
  call: 'info',
  hearing: 'warning',
  conciliation: 'warning',
  meeting: 'primary',
  follow_up: 'neutral',
  deadline: 'warning',
  other: 'neutral',
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: 'Agendado',
  done: 'Realizado',
  cancelled: 'Cancelado',
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Administrador',
  lawyer: 'Abogado',
}
