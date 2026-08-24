/**
 * Teléfono / WhatsApp mexicano.
 *
 * Se GUARDA normalizado a 10 dígitos y se MUESTRA con separadores. Guardar lo
 * que la persona tecleó ("+52 55 1234-5678", "044 55...") haría imposible
 * detectar envíos repetidos y obligaría al abogado a interpretar el número.
 */

/** LADAs de dos dígitos; el resto del país usa tres. */
const TWO_DIGIT_AREA_CODES = ['55', '56', '33', '81']

/**
 * Deja 10 dígitos, o null si el número no es un teléfono mexicano marcable.
 *
 * Acepta lo que la gente escribe de verdad: espacios, guiones, paréntesis,
 * prefijo +52, el viejo 1 de celular (+521…) y el 044/045 de la era anterior.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')

  if (digits.startsWith('00521') || digits.startsWith('00522')) digits = digits.slice(4)
  else if (digits.startsWith('0052')) digits = digits.slice(4)
  if (digits.startsWith('521') || digits.startsWith('522')) digits = digits.slice(3)
  else if (digits.startsWith('52') && digits.length > 10) digits = digits.slice(2)
  if ((digits.startsWith('044') || digits.startsWith('045')) && digits.length === 13) {
    digits = digits.slice(3)
  }
  if (digits.startsWith('1') && digits.length === 11) digits = digits.slice(1)

  if (digits.length !== 10) return null
  // Ninguna LADA nacional empieza en 0 ni en 1.
  if (digits.startsWith('0') || digits.startsWith('1')) return null
  return digits
}

/** "5512345678" -> "55 1234 5678"; "4771234567" -> "477 123 4567". */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits || digits.length !== 10) return digits ?? '—'
  if (TWO_DIGIT_AREA_CODES.includes(digits.slice(0, 2))) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

/** Enlace de WhatsApp con lada de país, para que el abogado escriba en un clic. */
export function whatsappHref(digits: string): string {
  return `https://wa.me/52${digits}`
}

export function telHref(digits: string): string {
  return `tel:+52${digits}`
}
