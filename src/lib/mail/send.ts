/**
 * ENVÍO DE CORREO (Resend).
 *
 * Por qué a mano y no con el SDK: es UNA petición HTTP. El repositorio maneja
 * datos personales y cada dependencia nueva es superficie que alguien tiene que
 * auditar; treinta líneas de `fetch` no lo son.
 *
 * TRES REGLAS que este archivo no rompe nunca:
 *
 *  1. NO LANZA. Devuelve si salió o no. Quien llama está guardando la solicitud
 *     de alguien que acaba de perder su trabajo, y un buzón caído no puede
 *     costarle el caso.
 *
 *  2. SE ESPERA, con plazo. La petición se aborta a los 6 segundos con un
 *     AbortController de verdad —no con una carrera de promesas—: en serverless,
 *     dejar una petición en vuelo al devolver la respuesta la deja colgada
 *     cuando la instancia se congela. Abortar la cancela; correr contra ella
 *     solo deja de mirarla.
 *
 *  3. NO ESCRIBE EL CONTENIDO EN EL REGISTRO. Si falla, se anota el motivo y a
 *     quién iba, jamás el cuerpo: dentro va el nombre y el teléfono de un
 *     prospecto, y los registros de Vercel los ve más gente que el buzón.
 */
import { mailFrom, resendApiKey } from '@/lib/config/avisos'

const PLAZO_MS = 6000

export interface Correo {
  to: string[]
  subject: string
  text: string
}

export async function sendMail(correo: Correo): Promise<boolean> {
  const key = resendApiKey()
  const from = mailFrom()
  if (!key || !from || correo.to.length === 0) return false

  const control = new AbortController()
  const plazo = setTimeout(() => control.abort(), PLAZO_MS)

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Explícito a propósito: api.resend.com está detrás de Cloudflare, que
        // responde 1010 a clientes con agente de usuario por omisión o vacío.
        'User-Agent': 'portal-solo-laboral/1.0',
      },
      body: JSON.stringify({ from, to: correo.to, subject: correo.subject, text: correo.text }),
      signal: control.signal,
      cache: 'no-store',
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      console.error(
        `[correo] Resend respondió ${respuesta.status} para ${correo.to.length} destino(s): ${detalle.slice(0, 200)}`,
      )
      return false
    }
    return true
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'desconocido'
    console.error(`[correo] no se pudo enviar (${motivo})`)
    return false
  } finally {
    clearTimeout(plazo)
  }
}
