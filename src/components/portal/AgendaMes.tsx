'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useAgenda } from '@/components/portal/AgendaProvider'
import { EVENT_DOT } from '@/components/portal/agendaTipo'
import { anchorFromElement, anchorFromPoint } from '@/components/ui/Popover'
import { formatDateLong, formatTime, plainDateOf } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import type { AgendaEvent } from '@/lib/domain/types'

/** La hora que se propone al agendar desde el mes, donde no hay horas que mirar. */
const HORA_POR_OMISION = { startTime: '10:00', endTime: '11:00' }

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/**
 * REJILLA DEL MES.
 *
 * Responde "¿cómo viene el mes?", no "¿qué hay el jueves?": en una celda de
 * calendario no cabe de quién es la cita ni su teléfono. Por eso tocar un día
 * sigue eligiéndolo para el panel de abajo, que es donde sí cabe todo.
 *
 * Agendar tiene entonces su propio gesto —el `+` de la esquina— en vez de robarle
 * el clic a la selección del día. En la semana y en el día, donde no hay panel
 * que elegir, se agenda tocando la hora directamente.
 */
export function AgendaMes({
  days,
  month,
  selected,
  today,
  events,
}: {
  days: PlainDate[]
  month: PlainDate
  selected: PlainDate
  today: PlainDate
  events: AgendaEvent[]
}) {
  const router = useRouter()
  const { crear, abrir } = useAgenda()

  const porDia = useMemo(() => {
    const mapa = new Map<PlainDate, AgendaEvent[]>()
    for (const evento of events) {
      const clave = plainDateOf(evento.startAt)
      const lista = mapa.get(clave)
      if (lista) lista.push(evento)
      else mapa.set(clave, [evento])
    }
    return mapa
  }, [events])

  return (
    <div className="sl-card sl-in overflow-hidden">
      <div className="grid grid-cols-7 border-b border-sl-border bg-sl-background">
        {WEEKDAYS.map((nombre) => (
          <div
            key={nombre}
            className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-sl-muted"
          >
            {nombre}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((fecha) => {
          const delMes = fecha.slice(0, 7) === month.slice(0, 7)
          const esHoy = fecha === today
          const activo = fecha === selected
          const lista = porDia.get(fecha) ?? []

          return (
            <div
              key={fecha}
              className={clsx(
                'group relative flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-sl-border p-1.5 sm:min-h-[6rem]',
                delMes ? 'bg-sl-surface' : 'bg-sl-background',
                activo && 'ring-2 ring-inset ring-sl-primary',
              )}
            >
              {/* El fondo entero elige el día. Va como botón y no como enlace
                  envolvente para poder llevar dentro otros botones: un `<a>` con
                  botones anidados no es HTML válido ni navegable con teclado. */}
              <button
                type="button"
                onClick={() => router.push(`/portal/calendario?vista=mes&dia=${fecha}`, { scroll: false })}
                aria-current={activo ? 'date' : undefined}
                aria-label={`${formatDateLong(fecha)}, ${lista.length} ${
                  lista.length === 1 ? 'actividad' : 'actividades'
                }`}
                className={clsx(
                  'absolute inset-0 transition-colors',
                  !activo && 'hover:bg-sl-primary-soft/50',
                )}
              />

              <div className="pointer-events-none relative flex items-start justify-between">
                <span
                  className={clsx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
                    esHoy && 'bg-sl-primary font-semibold text-white',
                    !esHoy && delMes && 'text-sl-text',
                    !esHoy && !delMes && 'text-sl-muted',
                  )}
                >
                  {Number(fecha.slice(8, 10))}
                </span>

                {/* En el teléfono va SIEMPRE visible: ahí no existe `hover`, y un
                    botón que solo aparece al pasar el cursor sencillamente no
                    existe para quien entra desde el celular. En escritorio sí se
                    esconde hasta que el cursor entra en la celda —cuarenta y dos
                    cruces permanentes convertirían la rejilla del mes en ruido— y
                    vuelve con el teclado, que tampoco tiene cursor. */}
                <button
                  type="button"
                  onClick={(evento) =>
                    crear(
                      { day: fecha, ...HORA_POR_OMISION },
                      anchorFromElement(evento.currentTarget),
                    )
                  }
                  aria-label={`Agendar el ${formatDateLong(fecha)}`}
                  className="pointer-events-auto rounded-full p-1 text-sl-muted transition-opacity
                    hover:bg-sl-primary-soft hover:text-sl-primary
                    sm:p-0.5 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                >
                  <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />
                </button>
              </div>

              {/* En el móvil no cabe el título: puntos por tipo. En escritorio,
                  la hora y de quién es. */}
              <span className="pointer-events-none relative flex flex-wrap gap-0.5 sm:hidden">
                {lista.slice(0, 4).map((evento) => (
                  <span
                    key={evento.id}
                    className={clsx('h-1.5 w-1.5 rounded-full', EVENT_DOT[evento.eventType])}
                    aria-hidden
                  />
                ))}
              </span>

              <span className="relative hidden min-w-0 flex-col gap-0.5 sm:flex">
                {lista.slice(0, 3).map((evento) => (
                  <button
                    key={evento.id}
                    type="button"
                    onClick={(clic) => abrir(evento, anchorFromPoint(clic.clientX, clic.clientY))}
                    className={clsx(
                      'flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-0.5 text-left text-[10px] leading-tight',
                      evento.status === 'done'
                        ? 'text-sl-muted line-through hover:bg-sl-background'
                        : 'bg-sl-primary-soft/70 text-sl-text hover:bg-sl-primary-soft',
                    )}
                  >
                    <span
                      className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', EVENT_DOT[evento.eventType])}
                      aria-hidden
                    />
                    <span className="shrink-0 tabular-nums">{formatTime(evento.startAt)}</span>
                    <span className="truncate">{evento.clientName ?? evento.title}</span>
                  </button>
                ))}
                {lista.length > 3 ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/portal/calendario?vista=dia&dia=${fecha}`, { scroll: false })
                    }
                    className="px-1 text-left text-[10px] text-sl-muted hover:text-sl-primary hover:underline"
                  >
                    +{lista.length - 3} más
                  </button>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
