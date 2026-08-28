/**
 * CONFIGURACIÓN DE CONTACTO.
 *
 * Un solo lugar para el número de WhatsApp del despacho, la plantilla del
 * mensaje y los minutos de la llamada próxima. Repartirlos por los componentes
 * es cómo se acaba con dos números distintos en producción y nadie sabiendo
 * cuál contesta.
 *
 * Todo se lee del entorno EN EL SERVIDOR. El número nunca se decide en el
 * navegador: si el destino viajara desde el cliente, cualquiera podría hacer
 * que el formulario abriera una conversación con su propio teléfono.
 */

/**
 * Número oficial, en formato internacional y solo dígitos (lo que espera
 * wa.me). Para México: 52 + 10 dígitos, o 521 + 10 en números que aún exijan
 * el 1 de móvil.
 *
 * Si NO está configurado, la opción de WhatsApp sencillamente no se ofrece.
 * Es deliberado: más vale una pantalla con dos caminos que un botón que abre
 * una conversación con nadie, o peor, con un número equivocado.
 */
export function whatsappNumber(): string | null {
  const raw = process.env.SOLO_LABORAL_WHATSAPP_NUMBER?.replace(/\D/g, '') ?? ''
  // E.164 admite hasta 15 dígitos; menos de 10 no es un número marcable.
  if (raw.length < 10 || raw.length > 15) return null
  return raw
}

export function whatsappEnabled(): boolean {
  return whatsappNumber() !== null
}

/**
 * Plantilla del mensaje. Marcadores: {full_name}, {state_label},
 * {dismissal_days}, {folio}.
 *
 * REDACCIÓN NEUTRA a propósito: el formulario no pregunta el género y no vamos
 * a pedirlo solo para poder escribir "despedido" o "despedida". "Mi despido
 * ocurrió" resuelve el problema sin inventar un dato de la persona.
 *
 * Y NO dice que el caso esté aceptado. Pasar el filtro significa que cumple
 * los criterios iniciales; la decisión sigue siendo del despacho, y un mensaje
 * que la persona envía diciendo "mi caso fue aceptado" comprometería a Solo
 * Laboral con algo que ningún abogado ha decidido todavía.
 */
export const DEFAULT_WHATSAPP_TEMPLATE =
  'Hola, soy {full_name}. Trabajaba en {state_label}. Mi despido ocurrió hace ' +
  '{dismissal_days} días y llené el formulario de Solo Laboral porque estoy ' +
  'buscando orientación sobre mi situación.\n\nMi folio es {folio}.'

export function whatsappTemplate(): string {
  const custom = process.env.WHATSAPP_MESSAGE_TEMPLATE?.trim()
  return custom && custom.length > 0 ? custom : DEFAULT_WHATSAPP_TEMPLATE
}

/**
 * Llamada próxima: la ventana que se le promete a quien pide "que me llamen".
 *
 * El texto dice "aproximadamente en los próximos 10 a 15 minutos" y el evento
 * se agenda en el MÍNIMO de esa ventana: es preferible que el abogado vea la
 * llamada un poco antes de lo prometido y no un poco después.
 */
export function quickCallDelayMinutes(): { min: number; max: number } {
  const min = positiveInt(process.env.QUICK_CALL_MIN_DELAY, 10)
  const max = positiveInt(process.env.QUICK_CALL_MAX_DELAY, 15)
  // Una ventana invertida no se corrige en silencio con un valor inventado:
  // se colapsa al mínimo, que es la única lectura segura de los dos números.
  return { min, max: Math.max(min, max) }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 && value <= 24 * 60 ? value : fallback
}

/**
 * Días sin novedad tras los que un lead pasa a "Sin respuesta".
 *
 * Se cuentan desde la llamada que pidió —o desde su registro, si no pidió
 * ninguna—. Cinco días por omisión: menos castiga un puente largo, y más deja
 * la lista de Leads llena de gente a la que ya nadie va a marcar.
 */
export function noResponseDays(): number {
  const value = Number(process.env.LEAD_NO_RESPONSE_DAYS)
  return Number.isInteger(value) && value > 0 && value <= 365 ? value : 5
}
