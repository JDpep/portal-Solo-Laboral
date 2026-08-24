import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ensureSeeded } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { DEMO_CREDENTIALS } from '@/lib/db/seed'
import { LoginForm } from '@/app/acceso/LoginForm'
import { Logo } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

/** Puerta del portal privado: no debe aparecer en buscadores. */
export const metadata: Metadata = {
  title: 'Acceso · Solo Laboral',
  robots: { index: false, follow: false },
}

export default async function AccesoPage() {
  await ensureSeeded()
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

        {/* Accesos de la demo de Fase 1. Este bloque se elimina al conectar la base real. */}
        <div className="mt-6 rounded-sl border border-dashed border-sl-warning/60 bg-sl-warning/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sl-warning">
            Acceso DEMO — Fase 1
          </p>
          <dl className="space-y-2 text-xs text-sl-muted">
            {DEMO_CREDENTIALS.map((c) => (
              <div key={c.email}>
                <dt className="font-medium text-sl-text">{c.name}</dt>
                <dd className="font-mono leading-relaxed">
                  {c.email}
                  <span className="mx-1.5 text-sl-muted/60">·</span>
                  {c.password}
                </dd>
              </div>
            ))}
          </dl>
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
