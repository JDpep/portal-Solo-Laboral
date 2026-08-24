/**
 * Validación del formulario público.
 *
 * Función pura: recibe strings crudos y devuelve datos limpios o errores por
 * campo. Vive aparte de la server action para poder probarse sin HTTP, y es la
 * ÚNICA validación que cuenta — la del navegador solo sirve para ahorrarle un
 * viaje a la persona, cualquiera puede saltársela.
 *
 * Los mensajes están escritos para alguien que acaba de perder su trabajo y
 * probablemente escribe desde el teléfono: dicen qué falta y cómo arreglarlo,
 * sin jerga.
 */
import { addDays, compareDates, isPlainDate } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import { isStateCode } from '@/lib/domain/states'
import type { StateCode } from '@/lib/domain/states'
import { normalizePhone } from '@/lib/domain/phone'
import { sanitizeLine, sanitizeParagraphs } from '@/lib/domain/sanitize'

/** Topes de longitud. También los aplica el HTML, pero aquí es donde obligan. */
export const LIMITS = {
  nameMax: 120,
  phoneRawMax: 30,
  descriptionMax: 2000,
  /** Un despido de hace más de medio siglo es un error de captura, no un caso. */
  dismissalMaxYearsBack: 50,
} as const

export const LEAD_FIELDS = ['fullName', 'phone', 'state', 'dismissalDate', 'description'] as const
export type LeadField = (typeof LEAD_FIELDS)[number]

/** Lo que el navegador manda: todo string, todo sospechoso. */
export type LeadFormValues = Record<LeadField, string>

export interface ParsedLead {
  fullName: string
  /** 10 dígitos normalizados. */
  phone: string
  state: StateCode
  dismissalDate: PlainDate
  description: string
}

export type LeadFieldErrors = Partial<Record<LeadField, string>>

export type ParseLeadResult =
  { ok: true; data: ParsedLead } | { ok: false; fieldErrors: LeadFieldErrors }

export const EMPTY_LEAD_VALUES: LeadFormValues = {
  fullName: '',
  phone: '',
  state: '',
  dismissalDate: '',
  description: '',
}

/** Normaliza `FormData` a strings, sin confiar en que los campos existan. */
export function readLeadValues(formData: FormData): LeadFormValues {
  const read = (key: LeadField) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }
  return {
    fullName: read('fullName'),
    phone: read('phone'),
    state: read('state'),
    dismissalDate: read('dismissalDate'),
    description: read('description'),
  }
}

export function parseLeadForm(values: LeadFormValues, todayDate: PlainDate): ParseLeadResult {
  const fieldErrors: LeadFieldErrors = {}

  const fullName = sanitizeLine(values.fullName).slice(0, LIMITS.nameMax)
  if (!fullName) {
    fieldErrors.fullName = 'Escribe tu nombre completo.'
  } else if (fullName.length < 3) {
    fieldErrors.fullName = 'El nombre parece incompleto.'
  } else if (!/\p{L}/u.test(fullName)) {
    fieldErrors.fullName = 'El nombre debe contener letras.'
  } else if (fullName.split(' ').filter(Boolean).length < 2) {
    fieldErrors.fullName = 'Escribe tu nombre y tus apellidos.'
  }

  const rawPhone = sanitizeLine(values.phone)
  const phone = rawPhone.length > LIMITS.phoneRawMax ? null : normalizePhone(rawPhone)
  if (!rawPhone) {
    fieldErrors.phone = 'Escribe un teléfono donde podamos localizarte.'
  } else if (!phone) {
    fieldErrors.phone = 'El número debe tener 10 dígitos. Ejemplo: 55 1234 5678.'
  }

  const stateValue = sanitizeLine(values.state)
  let state: StateCode | null = null
  if (!stateValue) {
    fieldErrors.state = 'Selecciona tu estado.'
  } else if (!isStateCode(stateValue)) {
    fieldErrors.state = 'Selecciona un estado de la lista.'
  } else {
    state = stateValue
  }

  const dismissalRaw = sanitizeLine(values.dismissalDate)
  let dismissalDate: PlainDate | null = null
  if (!dismissalRaw) {
    fieldErrors.dismissalDate = 'Indica la fecha en que te despidieron.'
  } else if (!isPlainDate(dismissalRaw)) {
    fieldErrors.dismissalDate = 'La fecha no es válida.'
  } else if (compareDates(dismissalRaw, todayDate) > 0) {
    // NO NEGOCIABLE: una fecha futura es un dato imposible, no un "no califica".
    fieldErrors.dismissalDate = 'La fecha de despido no puede ser posterior a hoy.'
  } else if (
    compareDates(dismissalRaw, addDays(todayDate, -365 * LIMITS.dismissalMaxYearsBack)) < 0
  ) {
    fieldErrors.dismissalDate = 'Revisa la fecha: parece estar mal capturada.'
  } else {
    dismissalDate = dismissalRaw
  }

  /*
   * DESCRIPCIÓN OPCIONAL.
   *
   * Puede llegar vacía y el envío sigue siendo válido: pedirla obligaba a
   * redactar a alguien que escribe desde el teléfono el peor día de su año, y
   * el motor de calificación no la usa — decide con entidad y fecha. Lo que el
   * abogado pierde cuando falta es contexto para la llamada, no la llamada.
   *
   * Tampoco hay longitud mínima: si la persona escribió algo, por corto que
   * sea, se guarda tal cual. Rechazar "me corrieron" en un campo rotulado
   * "opcional" sería una contradicción.
   */
  const description = sanitizeParagraphs(values.description).slice(0, LIMITS.descriptionMax)

  if (Object.keys(fieldErrors).length > 0 || !phone || !state || !dismissalDate) {
    return { ok: false, fieldErrors }
  }
  return {
    ok: true,
    data: { fullName, phone, state, dismissalDate, description },
  }
}
