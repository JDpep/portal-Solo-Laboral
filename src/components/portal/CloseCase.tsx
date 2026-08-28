'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { useFormStatus } from 'react-dom'
import { CircleAlert, UserMinus } from 'lucide-react'
import { closeCaseAction } from '@/app/portal/seguimiento/actions'
import type { CloseCaseState } from '@/app/portal/seguimiento/actions'
import { FormError } from '@/components/ui/Form'
import { CASE_CLOSE_REASON_LABEL } from '@/lib/domain/labels'
import type { CaseCloseReason } from '@/lib/domain/types'

const REASONS: CaseCloseReason[] = [
  'completed',
  'client_declined',
  'client_unresponsive',
  'not_viable',
  'other',
]

/**
 * FINALIZAR SEGUIMIENTO.
 *
 * Terminar NO es borrar, y la pantalla lo dice antes de que nadie pulse: el
 * caso conserva su ruta, sus eventos y su historia, y pasa al histórico. Sin
 * esa frase, "finalizar" se parece demasiado a "eliminar" y la gente no lo usa
 * — y un caso que nadie cierra se queda para siempre en la lista de trabajo
 * pendiente, que es peor que cerrarlo mal.
 *
 * El motivo es obligatorio porque es lo único que el histórico podrá contar
 * después. "Otro" exige nota por la misma razón.
 */
export function CloseCase({ caseId }: { caseId: string }) {
  const [state, formAction] = useFormState<CloseCaseState, FormData>(closeCaseAction, {})
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CaseCloseReason | ''>('')

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        {/* "El cliente desistió" tiene botón propio porque es, de largo, el
            final más frecuente de un caso que no llega a término, y hacerlo
            pasar por el selector de motivos convertía lo habitual en lo
            engorroso. Es el mismo cierre y el mismo motivo: solo se ahorra el
            paso de elegirlo. */}
        <button
          type="button"
          onClick={() => {
            setReason('client_declined')
            setOpen(true)
          }}
          className="sl-btn-secondary"
        >
          <UserMinus className="h-4 w-4" aria-hidden />
          El cliente desistió
        </button>
        <button type="button" onClick={() => setOpen(true)} className="sl-btn-secondary">
          Finalizar seguimiento
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="sl-card sl-in space-y-3 p-4">
      <input type="hidden" name="caseId" value={caseId} />

      <div>
        <h3 className="text-sm font-semibold text-sl-text">
          {reason === 'client_declined'
            ? 'El cliente desistió. ¿Confirmas?'
            : '¿Por qué se termina el seguimiento?'}
        </h3>
        <p className="mt-0.5 text-xs text-sl-muted">
          El caso no se borra: conserva su ruta y su historia, y pasa al histórico.
        </p>
      </div>

      <div className="space-y-1.5">
        {REASONS.map((value) => (
          <label key={value} className="flex items-start gap-2.5 text-sm text-sl-text">
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="mt-0.5"
              required
            />
            {CASE_CLOSE_REASON_LABEL[value]}
          </label>
        ))}
      </div>

      {reason === 'other' ? (
        <div>
          <label htmlFor="note" className="sl-label">
            Cuéntanos el motivo
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            required
            maxLength={2000}
            className="sl-input"
            placeholder="Es lo que se va a leer en el histórico dentro de seis meses."
          />
        </div>
      ) : (
        <div>
          <label htmlFor="note" className="sl-label">
            Nota <span className="font-normal text-sl-muted">(opcional)</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            maxLength={2000}
            className="sl-input"
            placeholder={
              reason === 'client_declined'
                ? '¿Dijo por qué? Es lo que se lee en el histórico dentro de seis meses.'
                : undefined
            }
          />
        </div>
      )}

      <FormError message={state.error} />

      <div className="flex flex-wrap gap-2">
        <CloseButton />
        <button type="button" onClick={() => setOpen(false)} className="sl-btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function CloseButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="sl-btn-primary">
      {pending ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden
        />
      ) : (
        <CircleAlert className="h-4 w-4" aria-hidden />
      )}
      {pending ? 'Finalizando…' : 'Finalizar seguimiento'}
    </button>
  )
}
