/**
 * CONVENIOS — el cálculo de honorarios.
 *
 * Solo Laboral cobra un porcentaje (35 % por omisión) SOBRE LO ACORDADO CON EL
 * PATRÓN. De ahí salen tres cifras: lo acordado, los honorarios del despacho y
 * lo que le queda al trabajador.
 *
 * Todo va en CENTAVOS ENTEROS y el porcentaje en PUNTOS BASE (3500 = 35 %).
 * Con pesos en coma flotante, 0.1 + 0.2 ya no es 0.3, y una suma de cien
 * convenios termina descuadrada por centavos que nadie sabe explicar.
 *
 * `feeCents` replica EXACTAMENTE la columna generada `fee_amount_cents` de la
 * migración 0010 —redondeo al centavo, mitad hacia arriba—: la vista previa del
 * formulario tiene que decir lo mismo que guardará la base.
 */

/** Porcentaje que cobra Solo Laboral si no se indica otro. */
export const DEFAULT_FEE_RATE_BP = 3500

/** Tope razonable: cien mil millones de pesos. Coincide con el CHECK de la base. */
export const MAX_AGREED_CENTS = 10_000_000_000_000

/** Tamaño máximo de un documento. Vercel no acepta cuerpos de más de 4.5 MB. */
export const MAX_FILE_BYTES = 4_000_000

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
export type SettlementFileType = (typeof ALLOWED_FILE_TYPES)[number]

/** Honorarios de Solo Laboral: centavos × puntos base / 10 000, mitad hacia arriba. */
export function feeCents(agreedCents: number, rateBp: number): number {
  // BigInt: 10^13 centavos × 10^4 puntos base ya no cabe exacto en un double.
  const product = BigInt(agreedCents) * BigInt(rateBp)
  return Number((product * 2n + 10_000n) / 20_000n)
}

export interface SettlementBreakdown {
  agreedCents: number
  rateBp: number
  feeCents: number
  /** Lo que le queda al trabajador después de honorarios. */
  clientNetCents: number
}

export function breakdown(agreedCents: number, rateBp: number): SettlementBreakdown {
  const fee = feeCents(agreedCents, rateBp)
  return { agreedCents, rateBp, feeCents: fee, clientNetCents: agreedCents - fee }
}

/**
 * "$150,000.50", "150000.5", "150 000" → centavos. Null si no es un monto.
 *
 * Acepta comas de miles y espacios porque así se escribe un monto en México y
 * así viene en el convenio que el abogado tiene enfrente. NO acepta la coma
 * como separador decimal: "1,500" es mil quinientos, no uno y medio.
 */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$\s*/, '').replace(/[\s,]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AGREED_CENTS) return null
  return cents
}

/** "35", "35.5", "35 %" → puntos base. Null si no es un porcentaje entre 0 y 100. */
export function parseRateToBp(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s*%$/, '')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (bp < 0 || bp > 10_000) return null
  return bp
}

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 15000050 → "$150,000.50" */
export function formatMoney(cents: number): string {
  return MXN.format(cents / 100)
}

/** Sin centavos, para los indicadores grandes: 15000050 → "$150,001". */
export function formatMoneyShort(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

/** 3500 → "35 %", 3550 → "35.5 %" */
export function formatRate(bp: number): string {
  const value = bp / 100
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')} %`
}

/** 3500 → "35", para volver a ponerlo en un campo editable. */
export function rateInputValue(bp: number): string {
  const value = bp / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}

/** 15000050 → "150000.50", para volver a ponerlo en un campo editable. */
export function moneyInputValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Qué es de verdad el archivo, por sus primeros bytes.
 *
 * El `type` que manda el navegador lo decide la extensión del nombre, y un
 * `.exe` renombrado a `.pdf` llega diciendo `application/pdf`. Estos documentos
 * se abren luego en el navegador de otro abogado: se mira la firma del archivo.
 */
export function sniffFileType(bytes: Uint8Array): SettlementFileType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}

/** Nombre de archivo presentable y seguro para una cabecera. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  // Fuera caracteres de control y los que rompen una cabecera o un nombre.
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f"<>|]/g, '').trim().slice(0, 150)
  return cleaned || 'convenio'
}
