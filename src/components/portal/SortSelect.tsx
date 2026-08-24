'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { ArrowDownUp } from 'lucide-react'
import { useReportPending } from '@/components/portal/Refresh'

/**
 * Orden de la lista, para el teléfono.
 *
 * En escritorio se ordena tocando el encabezado de la tabla — pero en el
 * teléfono no hay tabla, hay tarjetas, y hasta ahora eso dejaba al abogado sin
 * ninguna forma de reordenar. Como la mayoría entra desde el celular, era la
 * mitad de la función escondida en la mitad menos usada del producto.
 *
 * Cada opción es un par (campo, dirección) porque en una lista de casos por
 * llamar solo una dirección de cada campo tiene sentido: el más reciente
 * primero, el despido más antiguo primero (el que menos margen deja).
 */
const OPTIONS = [
  { value: 'submittedAt:desc', label: 'Registro más reciente' },
  { value: 'submittedAt:asc', label: 'Registro más antiguo' },
  { value: 'dismissalDate:asc', label: 'Despido más antiguo' },
  { value: 'dismissalDate:desc', label: 'Despido más reciente' },
  { value: 'fullName:asc', label: 'Nombre (A–Z)' },
  { value: 'caseNumber:desc', label: 'Folio (mayor a menor)' },
] as const

export function SortSelect({ sort, direction }: { sort: string; direction: 'asc' | 'desc' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  useReportPending(pending)

  const current = `${sort}:${direction}`
  const value = OPTIONS.some((o) => o.value === current) ? current : 'submittedAt:desc'

  function change(next: string) {
    const [nextSort, nextDir] = next.split(':')
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', nextSort)
    params.set('dir', nextDir)
    params.delete('page') // otro orden siempre vuelve a la primera página
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div className="relative">
      <ArrowDownUp
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sl-muted"
        aria-hidden
      />
      <select
        aria-label="Ordenar la lista"
        className="sl-input pl-9 pr-8"
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
