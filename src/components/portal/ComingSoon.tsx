import { PageHeader } from '@/components/ui/PageHeader'

/**
 * Sección anunciada en la navegación que todavía no existe.
 *
 * Preferible a esconder el enlace: el despacho ya sabe que estas dos secciones
 * vienen, y una barra lateral que las oculta hasta el día del estreno hace
 * pensar que se olvidaron. Preferible también a un 404, que no distingue
 * "todavía no" de "se rompió".
 *
 * La pantalla dice qué se está construyendo y de dónde saldrán sus datos, para
 * que quien entre sepa que no falta nada por capturar.
 */
export function ComingSoon({
  title,
  description,
  detail,
}: {
  title: string
  description: string
  detail: string
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="sl-card px-6 py-10 text-center">
        <p className="mx-auto max-w-md text-sm leading-relaxed text-sl-muted">{detail}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-sl-warning">
          En construcción
        </p>
      </div>
    </>
  )
}
