import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { PendingBar, RefreshProvider } from '@/components/portal/Refresh'
import { MobileNav, SidebarNav } from '@/components/portal/Nav'
import { ROLE_LABEL } from '@/lib/domain/labels'
import type { PublicStaffUser } from '@/lib/domain/types'

/**
 * Marco del portal interno.
 *
 * En ESCRITORIO hay barra lateral: el portal dejó de tener una sola pantalla y
 * un abogado salta entre Leads, Seguimiento y Calendario decenas de veces al
 * día. La lateral mantiene visible dónde está y qué más hay, y deja el ancho
 * completo del contenido para las tablas, que es donde hace falta.
 *
 * En el TELÉFONO se conserva la cabecera pegajosa de antes y las secciones van
 * en una tira horizontal: la lista de leads se desplaza mucho, y sin cabecera
 * fija volver al inicio o salir obligaba a subir hasta arriba de todo.
 */
export function PortalShell({
  user,
  logoutAction,
  children,
}: {
  user: PublicStaffUser
  logoutAction: () => Promise<void>
  children: React.ReactNode
}) {
  return (
    <RefreshProvider>
      <div className="flex min-h-screen flex-col">
        <div className="sl-rule sticky top-0 z-20 lg:static" />
        <PendingBar />

        <div className="flex flex-1 flex-col lg:flex-row">
          {/* ───────────────────────── escritorio: barra lateral ───────────── */}
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sl-border bg-sl-surface px-4 py-5 lg:flex">
            <Link href="/portal" aria-label="Portal interno" className="mb-6 px-2">
              <Logo width={132} priority />
            </Link>

            <SidebarNav role={user.role} />

            <div className="mt-auto border-t border-sl-border pt-4">
              {/* El bloque de quién eres es también la puerta a tu cuenta: es
                  donde se busca, y ahorra un elemento más en la navegación. */}
              <Link
                href="/portal/cuenta"
                className="block rounded-sl px-3 py-1.5 transition-colors hover:bg-sl-primary-soft/60"
              >
                <span className="block text-sm font-medium text-sl-text">{user.name}</span>
                <span className="block text-xs text-sl-muted">
                  {ROLE_LABEL[user.role]} · Mi cuenta
                </span>
              </Link>
              <form action={logoutAction} className="mt-1">
                <button type="submit" className="sl-btn-ghost w-full justify-start px-3">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Cerrar sesión
                </button>
              </form>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* ───────────────────────── teléfono: cabecera ───────────────── */}
            <header className="sticky top-1 z-20 border-b border-sl-border bg-sl-surface/95 backdrop-blur lg:hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
                <Link href="/portal" aria-label="Portal interno" className="shrink-0">
                  <Logo width={88} priority />
                </Link>

                <div className="ml-auto flex items-center gap-2">
                  {/* El nombre no cabe; las iniciales sí, y bastan para
                      confirmar con qué cuenta se está viendo el portal. Y ya que
                      son lo único que representa al usuario aquí, llevan a su
                      cuenta: en el teléfono no hay barra lateral desde donde
                      llegar. */}
                  <Link
                    href="/portal/cuenta"
                    aria-label={`Mi cuenta · ${user.name}`}
                    title={`${user.name} · ${ROLE_LABEL[user.role]}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-sl-primary-soft text-xs font-semibold text-sl-primary transition-colors hover:bg-sl-primary hover:text-white"
                  >
                    {initials(user.name)}
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="sl-btn-ghost px-2.5" aria-label="Cerrar sesión">
                      <LogOut className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                </div>
              </div>
              <MobileNav role={user.role} />
            </header>

            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </RefreshProvider>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
