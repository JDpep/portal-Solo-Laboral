import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/guard'
import { logoutAction } from '@/app/acceso/actions'
import { PortalShell } from '@/components/portal/PortalShell'

/** Toda ruta bajo /portal exige sesión viva. La guarda corre en el servidor. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Portal interno · Solo Laboral',
  robots: { index: false, follow: false },
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  return (
    <PortalShell user={user} logoutAction={logoutAction}>
      {children}
    </PortalShell>
  )
}
