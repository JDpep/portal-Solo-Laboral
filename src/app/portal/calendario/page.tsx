import { requireStaff } from '@/lib/auth/guard'
import { ComingSoon } from '@/components/portal/ComingSoon'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
  await requireStaff()
  return (
    <ComingSoon
      title="Calendario"
      description="La agenda operativa del despacho: llamadas, audiencias, conciliaciones y juntas."
      detail="Las horas que la gente pide desde el formulario ya se están guardando con cada lead, y los eventos tienen su tabla en la base. Falta la agenda que los muestre y el alta manual de audiencias. Nada de lo que se está capturando hoy se pierde."
    />
  )
}
