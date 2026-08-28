import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from '@/app/acceso/LoginForm'
import { Logo } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

/** Puerta del portal privado: no debe aparecer en buscadores. */
export const metadata: Metadata = {
  title: 'Acceso · Solo Laboral',
  robots: { index: false, follow: false },
}

export default async function AccesoPage() {
  if (await getCurrentUser()) redirect('/portal')

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo width={172} priority />
          <p className="mt-3 text-sm text-sl-muted">Portal interno</p>
        </div>

        <div className="sl-card p-6">
          <h1 className="mb-1 text-lg font-semibold text-sl-text">Iniciar sesión</h1>
          <p className="mb-5 text-sm text-sl-muted">
            Acceso exclusivo del despacho. No existe registro público.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-sl-muted">
          <Link href="/" className="hover:underline">
            Volver a la página pública
          </Link>
        </p>
      </div>
    </div>
  )
}
