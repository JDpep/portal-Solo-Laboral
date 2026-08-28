import clsx from 'clsx'
import { Check, Minus } from 'lucide-react'
import { setStepStatusAction } from '@/app/portal/seguimiento/actions'
import { CHECKLIST_STATUS_LABEL } from '@/lib/domain/labels'
import type { ChecklistItem } from '@/lib/domain/types'

/**
 * UNA CASILLA DE LA CUADRÍCULA: este caso, este paso.
 *
 * Es un botón dentro de un formulario, no un `<input type="checkbox">`. Una
 * casilla de verdad necesita JavaScript para enviarse al cambiar, y la ruta de
 * un caso laboral es el registro de lo que se hizo: un clic que se pierde
 * porque un bundle no cargó no es aceptable ahí. Así funciona con el navegador
 * pelado y se ve igual.
 *
 * CUATRO ESTADOS, no dos. Marcar y desmarcar cubre el uso diario, pero la ruta
 * distingue además "en proceso" y "no aplica", y esconderlos aquí obligaría a
 * abrir el caso para entender por qué un paso ni está hecho ni está pendiente.
 * Se pintan distinto y se explican al pasar el cursor.
 */
export function StepCheckbox({
  caseId,
  item,
  stepTitle,
  clientName,
}: {
  caseId: string
  /** null = este caso no lleva ese paso (nació con otra plantilla). */
  item: ChecklistItem | null
  stepTitle: string
  clientName: string
}) {
  if (!item) {
    return (
      <span className="block text-center text-sl-border" title="Este caso no lleva ese paso">
        ·
      </span>
    )
  }

  const done = item.status === 'completed'
  const na = item.status === 'not_applicable'
  const doing = item.status === 'in_progress'

  // Desmarcar devuelve a pendiente; marcar completa. Los otros dos estados se
  // ponen desde la ficha del caso, donde hay sitio para explicarlos.
  const next = done ? 'pending' : 'completed'

  return (
    <form action={setStepStatusAction} className="flex justify-center">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        aria-pressed={done}
        title={`${stepTitle} · ${CHECKLIST_STATUS_LABEL[item.status]}${
          item.dueAt ? ' · con fecha en la agenda' : ''
        }`}
        aria-label={`${done ? 'Desmarcar' : 'Completar'} «${stepTitle}» de ${clientName}`}
        className={clsx(
          'relative flex h-6 w-6 items-center justify-center rounded-[6px] border-2 transition-colors',
          done && 'border-sl-success bg-sl-success text-white hover:opacity-80',
          na && 'border-sl-border bg-sl-background text-sl-muted hover:border-sl-muted',
          doing && 'border-sl-secondary-strong bg-sl-secondary/10 hover:bg-sl-secondary/20',
          !done && !na && !doing && 'border-sl-border bg-sl-surface hover:border-sl-primary',
        )}
      >
        {done ? <Check className="h-4 w-4" aria-hidden /> : null}
        {na ? <Minus className="h-3.5 w-3.5" aria-hidden /> : null}
        {doing ? (
          <span className="h-2 w-2 rounded-full bg-sl-secondary-strong" aria-hidden />
        ) : null}
        {/* Un paso con fecha en la agenda lleva una marca: es lo que distingue
            "hay que hacerlo" de "hay que hacerlo el jueves a las diez". */}
        {item.dueAt && !done ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sl-warning ring-1 ring-sl-surface"
            aria-hidden
          />
        ) : null}
      </button>
    </form>
  )
}
