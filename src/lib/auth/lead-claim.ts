/**
 * PERMISO TEMPORAL PARA AGENDAR.
 *
 * Quien acaba de enviar el formulario no tiene cuenta ni sesión, pero tiene
 * que poder elegir su hora de llamada. El problema es de autorización: hay
 * que dejarlo tocar SU solicitud y ninguna otra.
 *
 * La solución es una cookie httpOnly firmada con el id del caso. Nunca viaja
 * al navegador un identificador manipulable: el id no aparece en el HTML, no
 * está en la URL y no se puede leer desde JavaScript. Mandar el id al cliente
 * y confiar en que lo devuelva intacto convertiría un `lead_mt7e…` adivinable
 * en la llave de la agenda de cualquier otra persona.
 *
 * Dura 30 minutos: lo que tarda alguien en decidir un horario, no lo que dura
 * una sesión.
 */
import { cookies } from 'next/headers'
import { decodeSigned, encodeSigned } from '@/lib/auth/signing'

const COOKIE_NAME = 'sl_lead'
export const LEAD_CLAIM_TTL_MS = 30 * 60 * 1000

interface LeadClaim {
  leadId: string
  issuedAt: number
}

export function setLeadClaim(leadId: string): void {
  cookies().set(COOKIE_NAME, encodeSigned({ leadId, issuedAt: Date.now() } satisfies LeadClaim), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(LEAD_CLAIM_TTL_MS / 1000),
  })
}

/** Id del caso que esta persona puede agendar, o null si no hay o caducó. */
export function readLeadClaim(): string | null {
  const claim = decodeSigned<LeadClaim>(cookies().get(COOKIE_NAME)?.value)
  if (!claim || typeof claim.leadId !== 'string' || typeof claim.issuedAt !== 'number') return null
  if (Date.now() - claim.issuedAt > LEAD_CLAIM_TTL_MS) return null
  return claim.leadId
}

export function clearLeadClaim(): void {
  cookies().set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
}
