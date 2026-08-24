'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { useReportPending } from '@/components/portal/Refresh'

/**
 * Busqueda con rebote corto (brief 19: "debe reaccionar rápidamente").
 * Escribe el termino en la URL para que el filtro sea compartible y para que
 * el filtrado siga ocurriendo en servidor.
 */
export function SearchInput({
  paramName = 'q',
  placeholder = 'Buscar…',
  label,
}: {
  paramName?: string
  placeholder?: string
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  // La barra de arriba y el atenuado de la lista salen de aquí; sin proveedor
  // alrededor esto no hace nada y el campo sigue funcionando igual.
  useReportPending(pending)
  const [value, setValue] = useState(searchParams.get(paramName) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Si el usuario navega atras, el campo debe reflejar la URL vigente.
  const urlValue = searchParams.get(paramName) ?? ''
  useEffect(() => {
    setValue((current) => (current === urlValue ? current : urlValue))
  }, [urlValue])

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.trim()) params.set(paramName, next.trim())
    else params.delete(paramName)
    params.delete('page') // un filtro nuevo siempre vuelve a la primera pagina
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div className="relative w-full sm:w-72">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sl-muted"
        aria-hidden
      />
      <input
        type="search"
        aria-label={label}
        className="sl-input pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          setValue(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => push(next), 200)
        }}
      />
      {pending ? (
        <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-sl-border border-t-sl-primary" />
      ) : null}
    </div>
  )
}
