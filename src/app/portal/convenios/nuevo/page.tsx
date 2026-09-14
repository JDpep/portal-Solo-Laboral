import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listCaseOptions } from '@/lib/db/settlements'
import { listActiveUsers } from '@/lib/db/users'
import { isUuid } from '@/lib/db/leads'
import { today } from '@/lib/dates'
import { DEFAULT_FEE_RATE_BP, rateInputValue } from '@/lib/domain/convenio'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConvenioForm } from '@/components/portal/ConvenioForm'

export const dynamic = 'force-dynamic'

/**
 * REGISTRAR CONVENIO.
 *
 * Se llega desde la lista o desde la ficha de un caso (`?caso=<id>`), y en ese
 * segundo camino el caso ya viene elegido: quien está dentro del asunto no
 * tiene por qué buscarlo otra vez. El abogado por omisión es quien captura.
 */
export default async function NuevoConvenioPage({
  searchParams,
}: {
  searchParams: { caso?: string }
}) {
  const user = await requireStaff()
  const [cases, users] = await Promise.all([listCaseOptions(), listActiveUsers()])

  const caseId = searchParams.caso && isUuid(searchParams.caso) ? searchParams.caso : undefined
  const fromCase = caseId ? cases.find((c) => c.id === caseId) : undefined
  const back = fromCase ? `/portal/seguimiento/${fromCase.id}` : '/portal/convenios'

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-sl-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {fromCase ? `${fromCase.folio} · ${fromCase.clientName}` : 'Convenios'}
      </Link>

      <PageHeader
        title="Registrar convenio"
        description="Sube el convenio firmado y captura lo acordado con el patrón. Solo Laboral cobra el 35 % sobre ese monto."
      />

      <ConvenioForm
        mode="create"
        cases={cases}
        lawyers={users.map((u) => ({ id: u.id, name: u.name }))}
        today={today()}
        defaults={{
          caseId: fromCase?.id,
          lawyerId: user.id,
          signedOn: today(),
          amount: '',
          rate: rateInputValue(DEFAULT_FEE_RATE_BP),
          notes: '',
        }}
      />
    </div>
  )
}
