import { requireAdmin } from '@/lib/auth/guard'
import { ComingSoon } from '@/components/portal/ComingSoon'

export const dynamic = 'force-dynamic'

/**
 * `requireAdmin` y no `requireStaff`: el permiso se comprueba EN EL SERVIDOR.
 * Que el enlace no se pinte para un abogado no protege nada — quien escriba
 * la URL a mano tiene que chocar contra esta misma pared.
 */
export default async function AdministracionPage() {
  await requireAdmin()
  return (
    <ComingSoon
      title="Administración"
      description="Cuentas del despacho y plantillas de la ruta del caso."
      detail="Hoy las cuentas se dan de alta con el script de siembra y la plantilla de la ruta vive en la base, editable como datos. Falta la pantalla para hacerlo sin pasar por la terminal."
    />
  )
}
