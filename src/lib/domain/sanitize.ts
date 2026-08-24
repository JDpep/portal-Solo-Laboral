/**
 * Limpieza del texto libre que llega de internet.
 *
 * React escapa el HTML al pintar, así que esto NO es contra XSS: es contra
 * basura que rompe la lectura del abogado y contra trucos de presentación
 * —caracteres de control, marcas invisibles, sobreescritura bidireccional—
 * que hacen que un texto se vea distinto de lo que realmente se guardó.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Espacios de ancho cero, joiners y sobreescritura bidireccional. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

/** Texto de una sola línea: nombre, teléfono. */
export function sanitizeLine(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

/**
 * Texto de varias líneas: la descripción del caso.
 *
 * Conserva los párrafos —el relato de la persona se lee mejor con ellos— pero
 * colapsa las rachas de saltos que solo sirven para inflar el mensaje.
 */
export function sanitizeParagraphs(raw: string): string {
  return raw
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
