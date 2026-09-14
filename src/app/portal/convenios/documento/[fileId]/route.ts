import { getCurrentUser } from '@/lib/auth/session'
import { getSettlementFileContent } from '@/lib/db/settlements'

export const dynamic = 'force-dynamic'

/**
 * SIRVE UN DOCUMENTO DE CONVENIO.
 *
 * La misma pared que el resto del portal: sin sesión viva no sale un byte. Se
 * abre EN LÍNEA (el PDF en el visor del navegador, la foto en su pestaña) y no
 * como descarga: una descarga que falla se guarda como archivo con el error
 * dentro y nadie se entera. Por eso los errores también se responden en HTML.
 *
 * El tipo que se declara es el que se detectó por la firma del archivo al
 * subirlo, no el que dijo el navegador, y `nosniff` impide que el navegador
 * decida otra cosa.
 */
export async function GET(_request: Request, { params }: { params: { fileId: string } }) {
  const user = await getCurrentUser()
  if (!user) return page(401, 'Tu sesión expiró', 'Vuelve a entrar al portal para ver este documento.')

  const file = await getSettlementFileContent(params.fileId)
  if (!file) return page(404, 'Documento no encontrado', 'Puede que el enlace esté incompleto.')

  return new Response(new Uint8Array(file.content), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.content.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function page(status: number, title: string, body: string) {
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;background:#F4F6FB;color:#130E22;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><main style="background:#fff;border:1px solid #DDE2EF;border-radius:12px;padding:28px;max-width:26rem"><h1 style="font-size:18px;margin:0 0 8px">${title}</h1><p style="color:#5A6183;margin:0 0 16px">${body}</p><a href="/portal/convenios" style="color:#2B346B">Ir a Convenios</a></main></body></html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
