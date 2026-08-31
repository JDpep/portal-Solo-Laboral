'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import clsx from 'clsx'
import { Check, Clock, ListChecks, Phone, RotateCcw, User, X } from 'lucide-react'
import { cancelEventAction, setEventDoneAction } from '@/app/portal/calendario/actions'
import { EVENT_TYPE_LABEL, EVENT_TYPE_TONE } from '@/lib/domain/labels'
import { formatDateLong, formatTime, plainDateOf } from '@/lib/dates'
import { formatPhone, telHref } from '@/lib/domain/phone'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import type { AgendaEvent } from '@/lib/domain/types'

/**
 * UNA ACTIVIDAD, ABIERTA DESDE LA REJILLA.
 *
 * En la vista de semana un bloque de media hora no da para el teléfono del
 * cliente ni para los botones de cerrar; este globo es donde caben. Dice lo
 * mismo y hace lo mismo que el renglón del panel del día —no hay dos catálogos
 * de acciones según por dónde se entre— y respeta la misma regla: lo que nació
 * de un paso de la ruta no se cierra aquí, se cierra en la ruta.
 *
 * Las acciones se disparan con `useTransition` en vez de con un formulario: el
 * globo tiene que cerrarse cuando el servidor termina, no cuando el navegador
 * envía, o el usuario ve un instante el estado viejo.
 */
export function EventoDetalle({
  event,
  onClose,
}: {
  event: AgendaEvent
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const done = event.status === 'done'
  const deLaRuta = event.checklistItemId !== null
  const href = event.caseId
    ? `/portal/seguimiento/${event.caseId}`
    : event.leadId
      ? `/portal/${event.leadId}`
      : null

  const ejecutar = (accion: (formData: FormData) => Promise<void>, campos: Record<string, string>) => {
    start(async () => {
      const formData = new FormData()
      for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor)
      await accion(formData)
      onClose()
    })
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge tone={EVENT_TYPE_TONE[event.eventType]}>{EVENT_TYPE_LABEL[event.eventType]}</Badge>
          <h2
            className={clsx(
              'mt-1.5 text-base font-semibold',
              done ? 'text-sl-muted line-through' : 'text-sl-text',
            )}
          >
            {event.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-sl-muted transition-colors hover:bg-sl-primary-soft hover:text-sl-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-2.5 text-sl-text">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          <span className="first-letter:uppercase">
            {formatDateLong(plainDateOf(event.startAt))}
            <span className="ml-1.5 tabular-nums">
              {formatTime(event.startAt)}
              {event.endAt ? ` – ${formatTime(event.endAt)}` : ''}
            </span>
          </span>
        </p>

        <p className="flex items-start gap-2.5 text-sl-text">
          <User className="mt-0.5 h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          <span className="min-w-0">
            {event.clientName ? (
              href ? (
                <Link href={href} className="text-sl-primary hover:underline">
                  {event.clientName}
                </Link>
              ) : (
                event.clientName
              )
            ) : (
              <span className="text-sl-muted">Sin cliente asociado</span>
            )}
            {event.folio ? <span className="font-mono text-xs"> · {event.folio}</span> : null}
            {event.assignedUserName ? (
              <span className="text-sl-muted"> · {event.assignedUserName}</span>
            ) : null}
            {event.isDemo ? <DemoBadge /> : null}
          </span>
        </p>

        {event.description ? (
          <p className="whitespace-pre-line pl-[26px] text-sl-muted">{event.description}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {event.phone && !event.isDemo ? (
          <a
            href={telHref(event.phone)}
            className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1.5 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{formatPhone(event.phone)}</span>
          </a>
        ) : null}

        {deLaRuta ? (
          <Link
            href={href ?? '/portal/seguimiento'}
            className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1.5 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
            title="Nació de un paso de la ruta: se cierra completando ese paso."
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Ver en la ruta
          </Link>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                ejecutar(setEventDoneAction, { eventId: event.id, done: done ? 'no' : 'si' })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1.5 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft disabled:opacity-60"
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

            {/* Cancelar no borra: la agenda es también el registro de lo que se
                había previsto y no ocurrió. */}
            {event.source === 'manual' && !done ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => ejecutar(cancelEventAction, { eventId: event.id })}
                className="inline-flex items-center gap-1.5 rounded-full border border-sl-border px-3 py-1.5 text-xs font-medium text-sl-muted transition-colors hover:bg-sl-danger/10 hover:text-sl-danger disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancelar
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
