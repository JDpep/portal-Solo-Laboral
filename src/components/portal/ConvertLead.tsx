'use client'

import { useFormState } from 'react-dom'
import { ArrowRightCircle } from 'lucide-react'
import { convertLeadAction } from '@/app/portal/seguimiento/actions'
import type { ConvertState } from '@/app/portal/seguimiento/actions'
import { SubmitButton, FormError } from '@/components/ui/Form'
import type { PublicStaffUser } from '@/lib/domain/types'

/**
 * CONVERTIR EN CASO.
 *
 * Es la decisión que separa "alguien que nos escribió" de "un asunto que
 * llevamos", y por eso no se toma sola: nada la dispara automáticamente, la
 * pulsa una persona. Antes de eso el lead vive en su lista y se le llama.
 *
 * Al convertir NO se vuelve a capturar nada. El nombre, el contacto, el estado
 * y la fecha de despido los hereda el caso; sus llamadas ya agendadas lo
 * siguen. Por eso aquí solo se pregunta una cosa: quién lo lleva.
 */
export function ConvertLead({
  leadId,
  users,
}: {
  leadId: string
  users: PublicStaffUser[]
}) {
  const [state, formAction] = useFormState<ConvertState, FormData>(convertLeadAction, {})

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="assignedTo">
          Responsable del caso
        </label>
        <select id="assignedTo" name="assignedTo" defaultValue="" className="sl-input sm:w-56">
          <option value="">Sin responsable asignado</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <SubmitButton>
          <ArrowRightCircle className="h-4 w-4" aria-hidden />
          Convertir en caso
        </SubmitButton>
      </div>

      <FormError message={state.error} />
    </form>
  )
}
