import { NextResponse } from 'next/server'
import { db } from '@/lib/db/sql'

export const dynamic = 'force-dynamic'

/**
 * MANTENIMIENTO DIARIO.
 *
 * Lo llama el cron de Vercel una vez al día. Hace una sola cosa y a propósito:
 * TOCAR la base para que no se duerma. Supabase en plan gratuito pausa un
 * proyecto sin actividad, y un proyecto pausado no devuelve un error bonito —
 * tira el portal entero, incluido el formulario público. El despacho puede
 * pasar una semana tranquila; la base no puede enterarse.
 *
 * NO cambia ningún dato, y eso también es deliberado. La automatización
 * tentadora era marcar como "no respondió" al prospecto cuya llamada pasó hace
 * días. Sería mentir: si nadie lo llamó, quien no respondió fue el despacho, y
 * el sistema estaría escondiendo su propio retraso bajo la culpa del prospecto.
 * Ese retraso ya se ve donde tiene que verse —el bloque de atrasados del
 * calendario— y ahí no se puede confundir de quién es.
 *
 * SIN SECRETO NO ENTRA. El repositorio es público y esta ruta vive en un
 * dominio adivinable.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')

  // Sin secreto configurado la ruta no existe para nadie: es preferible un cron
  // que no corre a una puerta abierta en un portal con datos personales.
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('No encontrado', { status: 404 })
  }

  try {
    const rows = await db()`
      SELECT
        (SELECT count(*)::int FROM leads)  AS leads,
        (SELECT count(*)::int FROM cases WHERE closed_at IS NULL) AS casos_abiertos,
        (SELECT count(*)::int FROM calendar_events
          WHERE status = 'scheduled' AND start_at < now())        AS atrasados
    `
    return NextResponse.json({ ok: true, ...rows[0] })
  } catch (error) {
    // Se responde 500 para que el cron quede marcado como fallido en Vercel: un
    // mantenimiento que falla en silencio no es mantenimiento.
    console.error('[cron] mantenimiento falló:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
