import Link from 'next/link'
import clsx from 'clsx'
import { Check, ListChecks, Phone, RotateCcw } from 'lucide-react'
import { setEventDoneAction } from '@/app/portal/seguimiento/actions'
import { EVENT_TYPE_LABEL, EVENT_TYPE_TONE } from '@/lib/domain/labels'
import { formatTime } from '@/lib/dates'
import { formatPhone, telHref } from '@/lib/domain/phone'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import type { AgendaEvent } from '@/lib/domain/types'

/**
 * UN RENGLÓN DE LA AGENDA.
 *
 * Se lee de izquierda a derecha en el orden en que se decide qué hacer: a qué
 * hora, qué es, de quién y quién lo lleva. La hora va primero y en tabular
 * porque la columna se escanea en vertical.
 *
 * Los eventos que nacen de un paso de la ruta no se cierran desde aquí: llevan
 * un enlace a su caso. Cerrar el mismo hecho por dos puertas distintas es la
 * forma más rápida de que la agenda y la ruta acaben contando cosas distintas.
 */
export function AgendaEventRow({ event, overdue = false }: { event: AgendaEvent; overdue?: boolean }) {
  const done = event.status === 'done'
  const fromRoute = event.checklistItemId !== null
  const href = event.caseId ? `/portal/seguimiento/${event.caseId}` : event.leadId ? `/portal/${event.leadId}` : null

  return (
    <li
      className={clsx(
        'flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:gap-4',
        done && 'bg-sl-background',
      )}
    >
      <span
        className={clsx(
          'w-14 shrink-0 text-sm font-semibold tabular-nums',
          overdue ? 'text-sl-danger' : done ? 'text-sl-muted' : 'text-sl-text',
        )}
      >
        {formatTime(event.startAt)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={EVENT_TYPE_TONE[event.eventType]}>{EVENT_TYPE_LABEL[event.eventType]}</Badge>
          <p className={clsx('text-[15px] font-medium', done ? 'text-sl-muted line-through' : 'text-sl-text')}>
            {event.title}
          </p>
          {event.isDemo ? <DemoBadge /> : null}
        </div>

        <p className="mt-0.5 text-sm text-sl-muted">
          {event.clientName ? (
            href ? (
              <Link href={href} className="text-sl-primary hover:underline">
                {event.clientName}
              </Link>
            ) : (
              event.clientName
            )
          ) : (
            'Sin cliente asociado'
          )}
          {event.folio ? <span className="font-mono text-xs"> · {event.folio}</span> : null}
          {event.assignedUserName ? ` · ${event.assignedUserName}` : ''}
        </p>

        {event.description ? (
          <p className="mt-1 text-sm text-sl-muted">{event.description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {event.phone && !event.isDemo ? (
          <a
            href={telHref(event.phone)}
            className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{formatPhone(event.phone)}</span>
          </a>
        ) : null}

        {fromRoute ? (
          <Link
            href={href ?? '/portal/seguimiento'}
            className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
            title="Nació de un paso de la ruta: se cierra completando ese paso."
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Ver en la ruta
          </Link>
        ) : (
          <form action={setEventDoneAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="done" value={done ? 'no' : 'si'} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
            >
              {done ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Reabrir
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Realizado
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </li>
  )
}
