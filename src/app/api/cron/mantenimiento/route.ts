import { NextResponse } from 'next/server'
import { db } from '@/lib/db/sql'
import { markLeadsWithoutResponse } from '@/lib/db/leads'
import { recordAudit } from '@/lib/db/audit'
import { noResponseDays } from '@/lib/config/contact'

export const dynamic = 'force-dynamic'

/**
 * MANTENIMIENTO DIARIO.
 *
 * Lo llama el cron de Vercel una vez al día y hace dos cosas.
 *
 * 1. TOCA LA BASE para que no se duerma. Supabase en plan gratuito pausa un
 *    proyecto sin actividad, y pausado no devuelve un error bonito: tira el
 *    portal entero, incluido el formulario público. El despacho puede pasar una
 *    semana tranquila; la base no puede enterarse.
 *
 * 2. PASA A "SIN RESPUESTA" los leads que llevan días sin novedad, para que la
 *    lista de Leads sea trabajo pendiente de verdad y no un archivo con todo lo
 *    que alguna vez llegó.
 *
 *    El rótulo dice "Sin respuesta" y no "No respondió" a propósito: desde aquí
 *    no se puede saber quién se quedó callado, y si nadie marcó ese teléfono, el
 *    que no respondió fue el despacho. La bitácora sí guarda `contactados` y
 *    `sinContactar` por separado —el segundo número es cola propia sin atender,
 *    no prospectos que ignoraron al despacho— para que el día que se quiera
 *    medir, el dato esté y no haya que reconstruirlo.
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
    const dias = noResponseDays()
    const marcados = await markLeadsWithoutResponse(dias)

    if (marcados.length > 0) {
      const sinContactar = marcados.filter((lead) => !lead.wasContacted).length
      await recordAudit({
        userId: null,
        action: 'lead_update',
        entity: 'lead',
        entityId: null,
        after: {
          porCron: true,
          estado: 'no_response',
          dias,
          total: marcados.length,
          contactados: marcados.length - sinContactar,
          // Estos NO son prospectos que ignoraran al despacho: son leads a los
          // que nunca se llegó a marcar. Van aparte para que no se confundan.
          sinContactar,
          folios: marcados.map((lead) => lead.folio),
        },
      })
    }

    const rows = await db()`
      SELECT
        (SELECT count(*)::int FROM leads)  AS leads,
        (SELECT count(*)::int FROM cases WHERE closed_at IS NULL) AS casos_abiertos,
        (SELECT count(*)::int FROM calendar_events
          WHERE status = 'scheduled' AND start_at < now())        AS atrasados
    `
    return NextResponse.json({ ok: true, sinRespuesta: marcados.length, ...rows[0] })
  } catch (error) {
    // Se responde 500 para que el cron quede marcado como fallido en Vercel: un
    // mantenimiento que falla en silencio no es mantenimiento.
    console.error('[cron] mantenimiento falló:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
