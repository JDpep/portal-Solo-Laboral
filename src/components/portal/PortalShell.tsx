import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { PendingBar, RefreshProvider } from '@/components/portal/Refresh'
import type { PublicStaffUser } from '@/lib/domain/types'

/**
 * Cabecera del portal interno.
 *
 * No hay barra lateral ni menú: el portal tiene una sola pantalla —casos por
 * contactar— y su detalle. Un menú de un elemento es ruido, y cuando el
 * despacho pida la siguiente pantalla será el momento de construirlo.
 *
 * En el teléfono la cabecera es PEGAJOSA. La lista de casos se desplaza mucho,
 * y sin esto volver al inicio o salir obligaba a subir hasta arriba de todo.
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
        <div className="sl-rule sticky top-0 z-20" />
        <PendingBar />

        <header className="sticky top-1 z-20 border-b border-sl-border bg-sl-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
            <Link href="/portal" aria-label="Casos por contactar" className="shrink-0">
              <Logo width={88} priority />
            </Link>
            <span className="hidden text-sm text-sl-muted sm:inline">Portal interno</span>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <p className="hidden text-sm font-medium text-sl-text sm:block">{user.name}</p>
              {/* En móvil el nombre no cabe; las iniciales sí, y bastan para
                confirmar con qué cuenta se está viendo el portal. */}
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-sl-primary-soft text-xs font-semibold text-sl-primary sm:hidden"
                title={user.name}
              >
                {initials(user.name)}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="sl-btn-ghost px-2.5 sm:px-4"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </RefreshProvider>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
