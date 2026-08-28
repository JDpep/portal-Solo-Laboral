import { requireStaff } from '@/lib/auth/guard'
import { ComingSoon } from '@/components/portal/ComingSoon'

export const dynamic = 'force-dynamic'

export default async function HistoricoPage() {
  await requireStaff()
  return (
    <ComingSoon
      title="Histórico"
      description="Todo lo que pasó con cada caso, y las métricas que salen de ahí."
      detail="No es una base aparte: es la vista de los casos cerrados, con su motivo de cierre, su ruta completa y su historia. Los casos que finalices desde Seguimiento ya se están guardando con todo eso; falta la pantalla que lo consulte y los indicadores."
    />
  )
}
