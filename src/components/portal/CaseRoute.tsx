import clsx from 'clsx'
import { Check, CircleDashed, CircleDot, MinusCircle } from 'lucide-react'
import { setStepStatusAction, updateStepAction, addStepAction } from '@/app/portal/seguimiento/actions'
import { CHECKLIST_STATUS_LABEL } from '@/lib/domain/labels'
import { formatDateTime } from '@/lib/dates'
import type { ChecklistItem, PublicStaffUser } from '@/lib/domain/types'

/**
 * RUTA DEL CASO.
 *
 * Es un checklist, pero se lee como un camino: lo hecho arriba, lo que toca
 * ahora marcado, lo que falta en gris. El abogado tiene que poder responder de
 * un vistazo "¿en qué va esto?" sin abrir nada.
 *
 * Cada paso se mueve con un formulario que POSTea al servidor. Sin JavaScript
 * de por medio: la ruta es el registro de lo que se hizo en un asunto laboral,
 * y un clic que se pierde porque un bundle no cargó no es aceptable ahí.
 *
 * LOS PASOS NO SON DEFINITIVOS. Salen de una plantilla editable; esta pantalla
 * no sabe cuáles son ni cuántos, solo los pinta en orden.
 */
export function CaseRoute({
  caseId,
  items,
  users,
  readOnly = false,
}: {
  caseId: string
  items: ChecklistItem[]
  users: PublicStaffUser[]
  /** Un caso cerrado se consulta, no se edita. */
  readOnly?: boolean
}) {
  return (
    <section className="sl-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-sl-border px-5 py-3.5">
        <h2 className="sl-eyebrow">Ruta del caso</h2>
        <span className="text-xs text-sl-muted">{items.length} pasos</span>
      </div>

      <ol className="divide-y divide-sl-border">
        {items.map((item) => (
          <li key={item.id} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <StepIcon status={item.status} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p
                    className={clsx(
                      'text-[15px] font-medium',
                      item.status === 'completed' && 'text-sl-muted line-through',
                      item.status === 'not_applicable' && 'text-sl-muted line-through',
                      item.status === 'in_progress' && 'text-sl-text',
                      item.status === 'pending' && 'text-sl-text',
                    )}
                  >
                    {item.title}
                  </p>
                  {item.status === 'in_progress' ? (
                    <span className="rounded-full bg-sl-secondary/10 px-2 py-0.5 text-xs font-medium text-sl-secondary-strong">
                      En proceso
                    </span>
                  ) : null}
                </div>

                {item.description ? (
                  <p className="mt-0.5 text-sm text-sl-muted">{item.description}</p>
                ) : null}

                {/* Las fechas cuentan la historia del paso: cuándo se empezó y
                    cuándo se cerró. Sin ellas no hay forma de medir después
                    cuánto tarda de verdad una etapa. */}
                {item.startedAt || item.completedAt ? (
                  <p className="mt-1 text-xs text-sl-muted">
                    {item.startedAt ? <>Iniciado {formatDateTime(item.startedAt)}</> : null}
                    {item.startedAt && item.completedAt ? ' · ' : null}
                    {item.completedAt ? <>Completado {formatDateTime(item.completedAt)}</> : null}
                  </p>
                ) : null}

                {item.notes ? (
                  <p className="mt-2 whitespace-pre-line rounded-sl bg-sl-background px-3 py-2 text-sm text-sl-text">
                    {item.notes}
                  </p>
                ) : null}

                {readOnly ? (
                  <p className="mt-1.5 text-xs text-sl-muted">
                    {CHECKLIST_STATUS_LABEL[item.status]}
                  </p>
                ) : (
                  <StepActions caseId={caseId} item={item} users={users} />
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {readOnly ? null : (
        <form
          action={addStepAction}
          className="flex flex-col gap-2 border-t border-sl-border bg-sl-background px-5 py-4 sm:flex-row"
        >
          <input type="hidden" name="caseId" value={caseId} />
          {/* Un asunto puede necesitar una diligencia que los demás no llevan.
              Añadirla aquí NO toca la plantilla: es de este caso y de ninguno más. */}
          <input
            type="text"
            name="title"
            required
            maxLength={200}
            placeholder="Añadir un paso a este caso…"
            className="sl-input flex-1"
            aria-label="Título del paso nuevo"
          />
          <button type="submit" className="sl-btn-secondary shrink-0">
            Añadir paso
          </button>
        </form>
      )}
    </section>
  )
}

function StepIcon({ status }: { status: ChecklistItem['status'] }) {
  const common = 'mt-0.5 h-5 w-5 shrink-0'
  if (status === 'completed') {
    return (
      <span
        className={clsx(
          common,
          'flex items-center justify-center rounded-full bg-sl-success text-white',
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (status === 'in_progress') {
    return <CircleDot className={clsx(common, 'text-sl-secondary-strong')} aria-hidden />
  }
  if (status === 'not_applicable') {
    return <MinusCircle className={clsx(common, 'text-sl-muted')} aria-hidden />
  }
  return <CircleDashed className={clsx(common, 'text-sl-muted')} aria-hidden />
}

/**
 * Las acciones de un paso: solo las que tienen sentido desde donde está.
 *
 * Un paso pendiente ofrece "Empezar" y "Completar"; uno terminado ofrece
 * deshacerse. Pintar los cuatro estados siempre convertía la ruta en una
 * cuadrícula de botones donde no se distinguía qué tocaba hacer.
 */
function StepActions({
  caseId,
  item,
  users,
}: {
  caseId: string
  item: ChecklistItem
  users: PublicStaffUser[]
}) {
  const buttons: { status: ChecklistItem['status']; label: string }[] =
    item.status === 'completed'
      ? [{ status: 'in_progress', label: 'Reabrir paso' }]
      : item.status === 'not_applicable'
        ? [{ status: 'pending', label: 'Sí aplica' }]
        : item.status === 'in_progress'
          ? [
              { status: 'completed', label: 'Completar' },
              { status: 'pending', label: 'Dejar pendiente' },
              { status: 'not_applicable', label: 'No aplica' },
            ]
          : [
              { status: 'in_progress', label: 'Empezar' },
              { status: 'completed', label: 'Completar' },
              { status: 'not_applicable', label: 'No aplica' },
            ]

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {buttons.map((button) => (
        <form key={button.status} action={setStepStatusAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="status" value={button.status} />
          <button
            type="submit"
            className="rounded-full border border-sl-border px-3 py-1 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
          >
            {button.label}
          </button>
        </form>
      ))}

      <details className="w-full">
        <summary className="cursor-pointer list-none text-xs font-medium text-sl-primary hover:underline">
          Notas y responsable
        </summary>
        <form action={updateStepAction} className="mt-2 space-y-2">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="itemId" value={item.id} />
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={item.notes}
            placeholder="Qué se hizo, qué falta, con quién se habló…"
            className="sl-input text-sm"
            aria-label={`Notas de ${item.title}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="assignedUserId"
              defaultValue={item.assignedUserId ?? ''}
              className="sl-input w-auto text-sm"
              aria-label={`Responsable de ${item.title}`}
            >
              <option value="">Sin responsable</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <button type="submit" className="sl-btn-secondary text-sm">
              Guardar
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}
