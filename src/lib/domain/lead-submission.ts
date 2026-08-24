/**
 * Contrato entre el formulario y la server action.
 *
 * Vive fuera de `actions.ts` porque un archivo `'use server'` solo puede
 * exportar funciones asíncronas: cualquier constante o estado inicial que el
 * cliente necesite tiene que declararse en un módulo aparte.
 */
import type { LeadFieldErrors, LeadFormValues } from '@/lib/domain/lead-form'
import type { CallPreference } from '@/lib/domain/call-slot'
import type { QualificationReason } from '@/lib/domain/qualification'

/**
 * Campo señuelo. Está en el DOM pero oculto y fuera del orden de tabulación:
 * una persona no lo ve ni lo alcanza, y los bots que rellenan todo sí caen.
 */
export const HONEYPOT_FIELD = 'sitioWeb'

export type LeadSubmissionState =
  | { status: 'idle' }
  | {
      status: 'invalid'
      fieldErrors: LeadFieldErrors
      values: LeadFormValues
      message?: string
    }
  | { status: 'blocked'; message: string; values: LeadFormValues }
  /** Pasó el filtro inicial. NO significa que el caso esté aceptado. */
  | { status: 'qualified'; caseNumber: string }
  /**
   * `reason` existe para poder decirle a la persona CUÁL de las dos condiciones
   * falló. Queda opcional a propósito: si algún camino no lo trajera, la
   * pantalla cae al mensaje general en vez de inventar un motivo.
   */
  | { status: 'unqualified'; reason?: UnqualifiedReason }

/** Los motivos del motor, menos el que califica. */
export type UnqualifiedReason = Exclude<
  QualificationReason,
  'qualified_allowed_state_and_recent_dismissal'
>

/**
 * Estrecha un motivo del motor al subconjunto de los que no califican.
 * Devuelve undefined si le llega el motivo que sí califica — imposible por
 * construcción, pero preferimos el mensaje general a una afirmación falsa.
 */
export function toUnqualifiedReason(reason: QualificationReason): UnqualifiedReason | undefined {
  return reason === 'qualified_allowed_state_and_recent_dismissal' ? undefined : reason
}

export const INITIAL_LEAD_STATE: LeadSubmissionState = { status: 'idle' }

/**
 * Resultado de agendar la llamada. Es un paso APARTE del envío: la solicitud
 * ya quedó registrada y el abogado va a llamar de todos modos, así que un
 * fallo aquí nunca puede leerse como "no se envió tu caso".
 */
export type ScheduleCallState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'scheduled'; preference: CallPreference }

export const INITIAL_SCHEDULE_STATE: ScheduleCallState = { status: 'idle' }
