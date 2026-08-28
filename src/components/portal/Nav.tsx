'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { CalendarDays, ClipboardList, History, Inbox, Users } from 'lucide-react'
import type { StaffRole } from '@/lib/domain/types'

/**
 * NAVEGACIÓN DEL PORTAL.
 *
 * "Seguimiento" es el nombre visible de los casos en curso. Se llama así y no
 * "Casos" porque describe lo que el abogado va a hacer ahí —seguir un asunto,
 * paso a paso— y porque separa de un vistazo las dos mitades del sistema:
 * Leads es gente por revisar; Seguimiento es trabajo comprometido.
 *
 * El elemento marcado se decide por prefijo de ruta, así que el detalle de un
 * caso mantiene "Seguimiento" encendido: quien está dentro de un caso tiene
 * que ver dónde está parado.
 */
const ITEMS = [
  { href: '/portal', label: 'Leads', icon: Inbox, exact: true },
  { href: '/portal/seguimiento', label: 'Seguimiento', icon: ClipboardList },
  { href: '/portal/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/portal/historico', label: 'Histórico', icon: History },
] as const

const ADMIN_ITEMS = [{ href: '/portal/administracion', label: 'Administración', icon: Users }] as const

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/** Barra lateral: escritorio, que es donde se trabaja un caso. */
export function SidebarNav({ role }: { role: StaffRole }) {
  const pathname = usePathname()
  const items = role === 'admin' ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Secciones del portal">
      {items.map((item) => {
        const active = isActive(pathname, item.href, 'exact' in item ? item.exact : false)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-2.5 rounded-sl px-3 py-2.5 text-sm transition-colors',
              active
                ? 'bg-sl-primary-soft font-semibold text-sl-primary'
                : 'text-sl-text hover:bg-sl-primary-soft/60',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Teléfono: la misma navegación en una tira horizontal bajo la cabecera.
 *
 * Un menú desplegable habría escondido las secciones detrás de un toque de
 * más; aquí caben las cuatro y se lee de un golpe dónde está uno.
 */
export function MobileNav({ role }: { role: StaffRole }) {
  const pathname = usePathname()
  const items = role === 'admin' ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS

  return (
    <nav
      className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:px-6 lg:hidden"
      aria-label="Secciones del portal"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href, 'exact' in item ? item.exact : false)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-sl-primary text-white'
                : 'bg-sl-primary-soft/60 text-sl-text hover:bg-sl-primary-soft',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
