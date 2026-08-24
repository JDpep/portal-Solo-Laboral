import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    /*
     * El título y sus acciones van SIEMPRE en la misma fila, también en el
     * teléfono: apilarlas dejaba el botón de actualizar solo en mitad de la
     * pantalla, pareciendo un control suelto en vez de la acción del
     * encabezado — y gastaba una franja de alto en la pantalla donde el alto
     * es lo que escasea.
     */
    <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-sl-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-sl-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div> : null}
    </div>
  )
}
