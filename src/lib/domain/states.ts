/**
 * Entidades federativas de México.
 *
 * El selector del formulario público muestra las 32: pedirle a la persona que
 * encuentre su estado y descubrir después que no calificaba es más honesto que
 * ofrecerle solo dos opciones y empujarla a mentir para poder enviar.
 *
 * La calificación (regla 1 del despacho) solo admite CIUDAD DE MÉXICO y
 * ESTADO DE MÉXICO. Esa lista vive aquí y en ningún otro lado.
 */

export const MEXICAN_STATES = [
  { code: 'AGU', label: 'Aguascalientes' },
  { code: 'BCN', label: 'Baja California' },
  { code: 'BCS', label: 'Baja California Sur' },
  { code: 'CAM', label: 'Campeche' },
  { code: 'CHP', label: 'Chiapas' },
  { code: 'CHH', label: 'Chihuahua' },
  { code: 'CMX', label: 'Ciudad de México' },
  { code: 'COA', label: 'Coahuila' },
  { code: 'COL', label: 'Colima' },
  { code: 'DUR', label: 'Durango' },
  { code: 'MEX', label: 'Estado de México' },
  { code: 'GUA', label: 'Guanajuato' },
  { code: 'GRO', label: 'Guerrero' },
  { code: 'HID', label: 'Hidalgo' },
  { code: 'JAL', label: 'Jalisco' },
  { code: 'MIC', label: 'Michoacán' },
  { code: 'MOR', label: 'Morelos' },
  { code: 'NAY', label: 'Nayarit' },
  { code: 'NLE', label: 'Nuevo León' },
  { code: 'OAX', label: 'Oaxaca' },
  { code: 'PUE', label: 'Puebla' },
  { code: 'QUE', label: 'Querétaro' },
  { code: 'ROO', label: 'Quintana Roo' },
  { code: 'SLP', label: 'San Luis Potosí' },
  { code: 'SIN', label: 'Sinaloa' },
  { code: 'SON', label: 'Sonora' },
  { code: 'TAB', label: 'Tabasco' },
  { code: 'TAM', label: 'Tamaulipas' },
  { code: 'TLA', label: 'Tlaxcala' },
  { code: 'VER', label: 'Veracruz' },
  { code: 'YUC', label: 'Yucatán' },
  { code: 'ZAC', label: 'Zacatecas' },
] as const

export type StateCode = (typeof MEXICAN_STATES)[number]['code']

/**
 * NO NEGOCIABLE: solo estas dos entidades pasan la condición 1.
 * Cambiar esta constante cambia el alcance territorial del despacho.
 */
export const QUALIFYING_STATES = ['CMX', 'MEX'] as const satisfies readonly StateCode[]

const BY_CODE = new Map<string, string>(MEXICAN_STATES.map((s) => [s.code, s.label]))

export function isStateCode(value: unknown): value is StateCode {
  return typeof value === 'string' && BY_CODE.has(value)
}

export function stateLabel(code: StateCode): string {
  return BY_CODE.get(code) ?? code
}

/** ¿La entidad está dentro de la cobertura territorial de Solo Laboral? */
export function isQualifyingState(code: StateCode): boolean {
  return (QUALIFYING_STATES as readonly string[]).includes(code)
}

/** Opciones para el <select> del formulario, en el orden en que se declaran. */
export const STATE_OPTIONS = MEXICAN_STATES.map((s) => ({
  value: s.code,
  label: s.label,
}))
