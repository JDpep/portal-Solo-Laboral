/**
 * ENTIDADES DEL SISTEMA.
 *
 * LEAD y CASO son cosas distintas, y el sistema entero descansa en esa
 * distinción:
 *
 *   LEAD  persona interesada que todavía se está revisando o contactando.
 *   CASO  lead que el despacho decidió tomar y convertir en asunto operativo.
 *
 * Un lead puede convertirse en caso, no responder, o descartarse. Un caso
 * SIEMPRE nace de un lead y hereda su folio: una sola referencia para la misma
 * persona desde que llega hasta que se cierra su asunto.
 */
import type { PlainDate } from '@/lib/dates'
import type { StateCode } from '@/lib/domain/states'
import type { QualificationReason, QualificationStatus } from '@/lib/domain/qualification'
import type { CallPreference } from '@/lib/domain/call-time'

export type Id = string

// ─────────────────────────────────────────────────────────────────── usuarios

/**
 * Miembro del despacho con acceso al portal.
 *
 *   admin   administra cuentas y las plantillas de la ruta del caso.
 *   lawyer  opera: leads, casos, seguimiento y calendario.
 *
 * El rol se comprueba SIEMPRE en el servidor. Esconder un botón no es un
 * permiso: quien escriba la URL a mano tiene que chocar contra la misma pared.
 */
export type StaffRole = 'admin' | 'lawyer'

export interface StaffUser {
  id: Id
  name: string
  email: string
  role: StaffRole
  status: 'active' | 'inactive'
  createdAt: string
  lastLoginAt: string | null
  /**
   * Último cambio de contraseña. Toda sesión emitida antes deja de valer, que
   * es lo que convierte el cambio en una revocación de verdad.
   */
  passwordChangedAt: string | null
  /** Hash scrypt. Nunca sale del servidor. */
  passwordHash: string | null
}

/** Vista segura para el cliente: sin hash de contraseña. */
export type PublicStaffUser = Omit<StaffUser, 'passwordHash'>

// ────────────────────────────────────────────────────────────────────── leads

/** Cómo llegó. Permite medir después de dónde vienen los casos. */
export type LeadSource = 'web_form' | 'manual' | 'phone' | 'whatsapp' | 'other'

/**
 * Dónde está el lead. `converted` es terminal: a partir de ahí manda el caso.
 */
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'discarded' | 'no_response'

/**
 * Cómo pidió la persona que la contactaran, después de calificar.
 *
 * Es una PREFERENCIA suya, no un estado del lead ni una promesa del despacho:
 * haber elegido WhatsApp no significa que nadie le haya escrito todavía.
 */
export type ContactMethod = 'whatsapp' | 'scheduled_call' | 'quick_call'

export interface Lead {
  id: Id
  /**
   * "SL-000001". Null SOLO en los envíos del formulario que no calificaron;
   * un alta manual siempre lo lleva, porque registrarla ya fue una decisión.
   */
  folio: string | null

  fullName: string
  /** 10 dígitos normalizados, sin lada de país ni separadores. */
  phone: string
  state: StateCode
  dismissalDate: PlainDate
  description: string

  source: LeadSource
  status: LeadStatus

  /** Instante real del envío (ISO UTC), para ordenar y para mostrar la hora. */
  submittedAt: string
  /** Fecha civil del envío en la zona de CDMX: la que usó el motor. */
  submittedOn: PlainDate

  qualificationStatus: QualificationStatus
  qualificationReason: QualificationReason
  /**
   * Días desde el despido AL MOMENTO DEL ENVÍO. Congelado a propósito: si se
   * recalculara al abrir el caso, un prospecto calificado empezaría a mostrar
   * 70, 80, 90 días y parecería que el filtro falló.
   */
  dismissalDaysAtSubmission: number

  /**
   * Hora en que la persona pidió que le llamaran. Null cuando no eligió — que
   * es un caso normal, no un error: el paso es opcional y el abogado llama
   * igual. Es una preferencia, no una reserva contra una agenda.
   */
  callPreference: CallPreference | null
  callPreferenceSetAt: string | null

  /** Vía que eligió tras calificar. Null si no eligió ninguna. */
  preferredContactMethod: ContactMethod | null
  /**
   * Abrió WhatsApp con el mensaje preparado. NO dice que lo enviara: con un
   * enlace wa.me el sistema no puede saberlo, y afirmarlo sería inventar.
   */
  whatsappOpenedAt: string | null
  /** Momento previsto de la llamada próxima. Previsión, no compromiso. */
  scheduledCallAt: string | null
  /** Contacto REAL. Nunca lo llena abrir WhatsApp ni pedir una llamada. */
  contactedAt: string | null

  /** Notas internas del despacho. Vacío en los envíos del formulario. */
  notes: string
  /** Quién lo capturó. Null cuando entró solo por el formulario público. */
  createdBy: Id | null

  /** En qué caso acabó, si se convirtió. */
  caseId: Id | null
  convertedToCaseAt: string | null

  /**
   * Registro de demostración. La interfaz lo rotula DEMO y NO ofrece llamar ni
   * escribir: los teléfonos sembrados tienen formato válido y podrían ser de
   * una persona real ajena al despacho.
   */
  isDemo: boolean

  /**
   * Si el despacho puede verlo. Lo calcula la BASE, no la aplicación:
   * calificados del formulario + todo lo capturado a mano.
   */
  visibleToStaff: boolean

  createdAt: string
  updatedAt: string
}

// ────────────────────────────────────────────────────────────────────── casos

export type CaseStatus =
  | 'active'
  | 'waiting_client'
  | 'scheduled'
  | 'in_process'
  | 'completed'
  | 'discontinued'
  | 'archived'

/** Por qué se terminó el seguimiento. Terminar NO es borrar. */
export type CaseCloseReason =
  | 'client_declined'
  | 'client_unresponsive'
  | 'not_viable'
  | 'completed'
  | 'other'

export interface Case {
  id: Id
  /** Heredado del lead. */
  folio: string
  leadId: Id

  status: CaseStatus
  /** Sale del primer paso sin terminar de la ruta; no se escribe a mano. */
  currentStage: string
  assignedUserId: Id | null

  openedAt: string
  closedAt: string | null
  closedReason: CaseCloseReason | null
  closedNote: string
  closedBy: Id | null

  createdBy: Id | null
  createdAt: string
  updatedAt: string
}

/** Lo que necesita una fila de Seguimiento, en una sola consulta. */
export interface CaseSummary extends Case {
  clientName: string
  phone: string
  dismissalDate: PlainDate
  submittedAt: string
  assignedUserName: string | null
  isDemo: boolean
  /** Pasos terminados sobre pasos que cuentan (los N/A no cuentan). */
  progress: { completed: number; total: number }
  nextEvent: { id: Id; type: EventType; title: string; startAt: string } | null
}

// ──────────────────────────────────────────────────────────── ruta del caso

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'not_applicable'

export interface ChecklistItem {
  id: Id
  caseId: Id
  templateItemId: Id | null
  title: string
  description: string
  status: ChecklistItemStatus
  position: number
  assignedUserId: Id | null
  startedAt: string | null
  completedAt: string | null
  completedBy: Id | null
  notes: string
  /**
   * Cuándo toca. Es el ÚNICO sitio donde se captura una fecha de trabajo: un
   * trigger de la base la refleja en el calendario. No hay un alta de eventos
   * aparte porque capturar la misma audiencia dos veces produce dos audiencias
   * que a la semana ya no coinciden.
   */
  dueAt: string | null
  /** Qué clase de cita es, para que la agenda la sepa pintar. */
  eventType: EventType
  createdAt: string
  updatedAt: string
}

export interface ChecklistTemplate {
  id: Id
  name: string
  description: string
  isDefault: boolean
  isActive: boolean
  items: ChecklistTemplateItem[]
}

export interface ChecklistTemplateItem {
  id: Id
  templateId: Id
  title: string
  description: string
  position: number
  /**
   * Un paso RETIRADO deja de copiarse a los casos nuevos, pero sigue entero en
   * los que ya lo llevan: cambiar el procedimiento del despacho no puede
   * reescribir el expediente de un asunto en curso. No se borra —la clave ajena
   * lo impide— porque es la referencia con la que la cuadrícula de Seguimiento
   * empareja cada casilla con su columna.
   */
  isActive: boolean
  /** Cuántos casos lo llevan. Es lo que hace visible que retirar no es borrar. */
  usedByCases?: number
}

// ───────────────────────────────────────────────────────────────── calendario

export type EventType =
  | 'call'
  | 'hearing'
  | 'conciliation'
  | 'meeting'
  | 'follow_up'
  | 'deadline'
  | 'other'

export type EventStatus = 'scheduled' | 'done' | 'cancelled'
export type EventSource = 'web_form' | 'manual' | 'system'

export interface CalendarEvent {
  id: Id
  leadId: Id | null
  caseId: Id | null
  /** El paso de la ruta que lo produjo, si nació de ahí. */
  checklistItemId: Id | null
  eventType: EventType
  title: string
  description: string
  startAt: string
  endAt: string | null
  assignedUserId: Id | null
  status: EventStatus
  source: EventSource
  createdBy: Id | null
  externalProvider: string | null
  externalEventId: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Un evento con el contexto que la agenda necesita para ser legible.
 *
 * Una lista que dice "Audiencia · 10:30" y nada más obliga a abrir cada renglón
 * para saber de quién es. El nombre y el folio viajan con el evento.
 */
export interface AgendaEvent extends CalendarEvent {
  clientName: string | null
  folio: string | null
  phone: string | null
  assignedUserName: string | null
  isDemo: boolean
}

// ──────────────────────────────────────────────────────────────── historia

export interface CaseStatusChange {
  id: Id
  caseId: Id
  previousStatus: CaseStatus | null
  newStatus: CaseStatus
  changedBy: Id | null
  changedByName: string | null
  changedAt: string
  reason: string
}

/**
 * Acciones que se registran en la bitácora. La lista es cerrada a propósito:
 * un string libre acaba con tres formas distintas de escribir lo mismo y una
 * bitácora que no se puede consultar.
 */
export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'lead_create'
  | 'lead_manual_create'
  | 'lead_update'
  | 'lead_convert_to_case'
  | 'lead_whatsapp_opened'
  | 'lead_contact_method_set'
  | 'lead_quick_call_requested'
  | 'case_create'
  | 'case_status_change'
  | 'case_assign'
  | 'case_close'
  | 'case_reopen'
  | 'checklist_item_start'
  | 'checklist_item_complete'
  | 'checklist_item_update'
  | 'event_create'
  | 'event_update'
  | 'event_cancel'
  | 'user_create'
  | 'user_update'
  | 'user_status_change'
  | 'user_password_set'
  | 'template_item_create'
  | 'template_item_update'
  | 'template_item_retire'
  | 'template_item_restore'
  | 'template_item_move'

export interface AuditEntry {
  id: Id
  userId: Id | null
  userName: string | null
  action: AuditAction
  entity: string
  entityId: Id | null
  before: unknown
  after: unknown
  ip: string | null
  createdAt: string
}
