import { Info } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { formatDateTime } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { CambiarPassword } from '@/components/portal/CambiarPassword'

export const dynamic = 'force-dynamic'

/**
 * MI CUENTA.
 *
 * Existe por una razón concreta: las cuentas se entregan con una contraseña
 * TEMPORAL que alguien tuvo que hacer llegar por un mensaje, y esa contraseña
 * deja de ser secreta en cuanto sale del sitio donde se generó. Sin esta
 * pantalla, la única salida era pedirle a un administrador que la cambiara —es
 * decir, contarle a otra persona cuál va a ser la tuya.
 *
 * No es Administración: aquí no se ve ni se toca la cuenta de nadie más.
 */
export default async function CuentaPage() {
  const user = await requireStaff()

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description="Tus datos y tu contraseña. Solo tú ves esta pantalla y solo afecta a tu cuenta."
      />

      <dl className="sl-card mb-4 grid max-w-md gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-sl-muted">Nombre</dt>
          <dd className="mt-0.5 text-sm text-sl-text">{user.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-sl-muted">Correo</dt>
          <dd className="mt-0.5 break-all text-sm text-sl-text">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-sl-muted">Rol</dt>
          <dd className="mt-0.5 text-sm text-sl-text">{ROLE_LABEL[user.role]}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-sl-muted">
            Contraseña cambiada
          </dt>
          <dd className="mt-0.5 text-sm text-sl-text">
            {user.passwordChangedAt ? (
              formatDateTime(user.passwordChangedAt)
            ) : (
              <span className="text-sl-muted">Nunca — sigues con la que te entregaron</span>
            )}
          </dd>
        </div>
      </dl>

      <h2 className="mb-2 text-sm font-semibold text-sl-text">Cambiar contraseña</h2>
      <CambiarPassword />

      <p className="mt-3 flex max-w-md items-start gap-2 rounded-sl bg-sl-primary-soft/60 px-3 py-2 text-xs text-sl-text">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sl-primary" aria-hidden />
        <span>
          Al cambiarla se cierran las demás sesiones abiertas con tu cuenta. Si te entregaron una
          contraseña temporal, cámbiala en cuanto entres: hasta entonces sirve a quien la haya visto
          por el camino.
        </span>
      </p>
    </>
  )
}
