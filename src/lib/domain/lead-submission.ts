/**
 * Contrato entre el formulario y la server action.
 *
 * Vive fuera de `actions.ts` porque un archivo `'use server'` solo puede
 * exportar funciones asíncronas: cualquier constante o estado inicial que el
 * cliente necesite tiene que declararse en un módulo aparte.
 */
import type { LeadFieldErrors, LeadFormValues } from '@/lib/domain/lead-form'
import type { CallPreference } from '@/lib/domain/call-time'
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
  | { status: 'qualified'; folio: string; contact: ContactOptions }
  /**
   * `reason` existe para poder decirle a la persona CUÁL de las dos condiciones
   * falló. Queda opcional a propósito: si algún camino no lo trajera, la
   * pantalla cae al mensaje general en vez de inventar un motivo.
   */
  | { status: 'unqualified'; reason?: UnqualifiedReason }

/**
 * Las vías de contacto que se le ofrecen a quien calificó, ya resueltas EN EL
 * SERVIDOR.
 *
 * El enlace de WhatsApp llega armado desde el servidor —número del despacho y
 * mensaje incluidos— y el navegador solo lo abre. Si el cliente pudiera
 * componerlo, bastaría con manipular un parámetro para que el formulario del
 * despacho abriera conversaciones con el teléfono de cualquiera.
 *
 * `whatsappUrl` es null cuando no hay número configurado: entonces la opción
 * sencillamente no se ofrece, en vez de pintar un botón que no lleva a nadie.
 */
export interface ContactOptions {
  whatsappUrl: string | null
  /** Minutos prometidos para la llamada próxima: "entre 10 y 15". */
  quickCallWindow: { min: number; max: number }
}

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

/**
 * Resultado de pedir "que me llamen enseguida".
 *
 * Devuelve la ventana prometida, no una hora exacta: el sistema no conoce la
 * agenda de los abogados, y decir "te llamamos a las 10:42" sería exactamente
 * la promesa que este producto lleva evitando desde el primer día.
 */
export type QuickCallState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'requested'; window: { min: number; max: number } }

export const INITIAL_QUICK_CALL_STATE: QuickCallState = { status: 'idle' }

/** Resultado de abrir WhatsApp. Solo importa cuando falla. */
export type WhatsAppState = { status: 'idle' } | { status: 'error'; message: string }

export const INITIAL_WHATSAPP_STATE: WhatsAppState = { status: 'idle' }
