import { requireAdmin } from '@/lib/auth/guard'
import { listAllUsers } from '@/lib/db/users'
import { findDefaultTemplate } from '@/lib/db/checklist'
import { PageHeader } from '@/components/ui/PageHeader'
import { Cuentas } from '@/components/portal/Cuentas'
import { Plantilla } from '@/components/portal/Plantilla'

export const dynamic = 'force-dynamic'

/**
 * ADMINISTRACIÓN — lo que antes había que hacer con la terminal.
 *
 * `requireAdmin` y no `requireStaff`: el permiso se comprueba EN EL SERVIDOR.
 * Que el enlace no se pinte para un abogado no protege nada — quien escriba la
 * URL a mano tiene que chocar contra esta misma pared, y aquí se dan de alta
 * cuentas con acceso a datos personales de prospectos.
 *
 * Dos cosas y ninguna más: quién entra, y cuál es la ruta que sigue un caso.
 * Son las dos que estaban obligando a abrir `psql` y el script de siembra.
 */
export default async function AdministracionPage() {
  const admin = await requireAdmin()
  const [users, template] = await Promise.all([listAllUsers(), findDefaultTemplate()])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Administración"
        description="Quién entra al portal y qué pasos sigue un caso."
      />

      <div className="space-y-5">
        <Cuentas users={users} currentUserId={admin.id} />
        <Plantilla template={template} />
      </div>
    </div>
  )
}
