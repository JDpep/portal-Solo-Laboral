import Link from 'next/link'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

/** Encabezado ordenable. Es un enlace: funciona sin JavaScript. */
export function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  basePath,
  params,
  align = 'left',
}: {
  label: string
  sortKey: string
  currentSort: string
  currentDirection: 'asc' | 'desc'
  basePath: string
  params: Record<string, string | undefined>
  align?: 'left' | 'right'
}) {
  const active = currentSort === sortKey
  const nextDirection = active && currentDirection === 'asc' ? 'desc' : 'asc'

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  search.set('sort', sortKey)
  search.set('dir', nextDirection)
  search.delete('page')

  const Icon = !active ? ArrowUpDown : currentDirection === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      scope="col"
      className={clsx('sl-th', align === 'right' && 'text-right')}
      aria-sort={active ? (currentDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {/*
        El icono va EN LÍNEA con el texto, no como item flex: con encabezados
        de dos líneas, un item flex se despega del rótulo y queda flotando.
      */}
      <Link
        href={`${basePath}?${search.toString()}`}
        className={clsx('hover:text-sl-primary', active && 'text-sl-primary')}
      >
        {label}
        <Icon className="ml-1 inline h-3 w-3 shrink-0 align-middle" aria-hidden />
      </Link>
    </th>
  )
}
