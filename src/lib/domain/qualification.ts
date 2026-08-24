/**
 * MOTOR DE CALIFICACIÓN — el corazón del sistema.
 *
 * Función pura, determinística y sin IA: mismas entradas, mismo resultado,
 * siempre. Vive fuera de la capa HTTP para poder probarse sin levantar la app,
 * y es la ÚNICA pieza que decide si un formulario llega o no a los abogados.
 *
 * Las dos condiciones (ambas obligatorias):
 *
 *   1. La entidad federativa es Ciudad de México o Estado de México.
 *   2. El despido ocurrió hace MENOS de 60 días.
 *
 * "Menos de 60" es estricto: exactamente 60 días NO califica. El límite se
 * escribe una sola vez, en RECENCY_LIMIT_DAYS, para que no haya dos verdades.
 */
import { compareDates, daysBetween } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import { isQualifyingState } from '@/lib/domain/states'
import type { StateCode } from '@/lib/domain/states'

/** NO NEGOCIABLE: el despido debe tener menos de estos días. */
export const RECENCY_LIMIT_DAYS = 60

export type QualificationStatus = 'qualified' | 'unqualified'

/**
 * Motivo legible por máquina. Se guarda con el registro para poder responder
 * después "¿por qué no entran las solicitudes?" sin volver a calcular nada.
 */
export type QualificationReason =
  | 'qualified_allowed_state_and_recent_dismissal'
  | 'unqualified_state'
  | 'unqualified_dismissal_date'
  | 'unqualified_state_and_dismissal_date'

export const QUALIFICATION_REASON_LABEL: Record<QualificationReason, string> = {
  qualified_allowed_state_and_recent_dismissal:
    'Entidad dentro de cobertura y despido de menos de 60 días.',
  unqualified_state: 'La entidad federativa está fuera de la cobertura del despacho.',
  unqualified_dismissal_date: 'El despido ocurrió hace 60 días o más.',
  unqualified_state_and_dismissal_date:
    'La entidad está fuera de cobertura y el despido ocurrió hace 60 días o más.',
}

export interface QualificationInput {
  state: StateCode
  dismissalDate: PlainDate
  /** Fecha civil del envío, en la zona de Ciudad de México. */
  submittedOn: PlainDate
}

export interface QualificationResult {
  status: QualificationStatus
  reason: QualificationReason
  /** Días completos transcurridos entre el despido y el envío. Nunca negativo. */
  dismissalDaysAgo: number
  allowedState: boolean
  recentDismissal: boolean
}

/**
 * Una fecha de despido futura no es "no calificada": es un dato imposible.
 * Se rechaza en la validación del formulario, antes de llegar aquí; si algo la
 * dejara pasar preferimos un error ruidoso a un registro silenciosamente malo.
 */
export class FutureDismissalDateError extends Error {
  constructor() {
    super('La fecha de despido no puede ser posterior a la fecha de envío.')
    this.name = 'FutureDismissalDateError'
  }
}

export function qualifyLead(input: QualificationInput): QualificationResult {
  if (compareDates(input.dismissalDate, input.submittedOn) > 0) {
    throw new FutureDismissalDateError()
  }

  const dismissalDaysAgo = daysBetween(input.dismissalDate, input.submittedOn)

  const allowedState = isQualifyingState(input.state)
  const recentDismissal = dismissalDaysAgo < RECENCY_LIMIT_DAYS

  if (allowedState && recentDismissal) {
    return {
      status: 'qualified',
      reason: 'qualified_allowed_state_and_recent_dismissal',
      dismissalDaysAgo,
      allowedState,
      recentDismissal,
    }
  }

  const reason: QualificationReason =
    !allowedState && !recentDismissal
      ? 'unqualified_state_and_dismissal_date'
      : !allowedState
        ? 'unqualified_state'
        : 'unqualified_dismissal_date'

  return {
    status: 'unqualified',
    reason,
    dismissalDaysAgo,
    allowedState,
    recentDismissal,
  }
}
