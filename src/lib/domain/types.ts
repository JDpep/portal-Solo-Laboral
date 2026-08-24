/** Entidades del sistema de captación y precalificación. */
import type { PlainDate } from '@/lib/dates'
import type { StateCode } from '@/lib/domain/states'
import type { QualificationReason, QualificationStatus } from '@/lib/domain/qualification'
import type { CallPreference } from '@/lib/domain/call-slot'

export type Id = string

/**
 * Un formulario público recibido, ya calificado.
 *
 * Se guardan TODOS los envíos, califiquen o no: sin los no calificados nadie
 * puede responder después "¿cuánta gente nos busca y por qué la dejamos
 * fuera?". Lo que cambia no es qué se guarda, sino qué se muestra: el portal
 * de abogados solo lee los `qualified` (ver src/lib/db/leads.ts).
 */
export interface Lead {
  id: Id
  /** "SL-000001". Solo existe para los calificados; null en el resto. */
  caseNumber: string | null

  fullName: string
  /** 10 dígitos normalizados, sin lada de país ni separadores. */
  phone: string
  state: StateCode
  dismissalDate: PlainDate
  description: string

  /** Instante real del envío (ISO UTC), para ordenar y para mostrar la hora. */
  submittedAt: string
  /** Fecha civil del envío en la zona de CDMX: la que usó el motor. */
  submittedOn: PlainDate

  qualificationStatus: QualificationStatus
  qualificationReason: QualificationReason
  /**
   * Días desde el despido AL MOMENTO DEL ENVÍO. Congelado a propósito: si se
   * recalculara al abrir el caso, un prospecto calificado empezaría a
   * mostrar 70, 80, 90 días y parecería que el filtro falló.
   */
  dismissalDaysAtSubmission: number

  /**
   * Franja en la que la persona pidió que le llamaran, elegida DESPUÉS de
   * calificar. Null cuando no eligió — que es un caso normal, no un error: el
   * paso es opcional y el abogado llama igual.
   *
   * Solo puede existir en un lead `qualified`: a quien no calificó nunca se le
   * ofrece la pantalla, y el repositorio lo impide de todos modos.
   */
  callPreference: CallPreference | null
  callPreferenceSetAt: string | null

  /**
   * Registro de demostración. La interfaz lo rotula DEMO y NO ofrece llamar ni
   * escribir: los teléfonos sembrados tienen formato válido y podrían ser de
   * una persona real ajena al despacho.
   */
  isDemo: boolean

  createdAt: string
}

/**
 * Miembro del despacho con acceso al portal interno.
 *
 * No hay registro público ni roles: en esta etapa el portal tiene una sola
 * pantalla y todos los que entran hacen lo mismo — ver casos y llamar.
 */
export interface StaffUser {
  id: Id
  name: string
  email: string
  status: 'active' | 'inactive'
  createdAt: string
  lastLoginAt: string | null
  /** Hash scrypt. Nunca sale del servidor. */
  passwordHash: string | null
}

/** Vista segura para el cliente: sin hash de contraseña. */
export type PublicStaffUser = Omit<StaffUser, 'passwordHash'>
