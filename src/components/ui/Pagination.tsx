import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  params,
}: {
  page: number
  pageCount: number
  total: number
  basePath: string
  params: Record<string, string | undefined>
}) {
  if (pageCount <= 1) {
    return (
      <p className="px-4 py-3 text-xs text-sl-muted">
        {total} {total === 1 ? 'registro' : 'registros'}
      </p>
    )
  }

  const href = (target: number) => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
    search.set('page', String(target))
    return `${basePath}?${search.toString()}`
  }

  return (
    <nav
      className="flex items-center justify-between gap-4 border-t border-sl-border px-4 py-3"
      aria-label="Paginación"
    >
      <p className="text-xs text-sl-muted">
        Página {page} de {pageCount} · {total} registros
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="sl-btn-secondary py-1.5" rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={href(page + 1)} className="sl-btn-secondary py-1.5" rel="next">
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  )
}
