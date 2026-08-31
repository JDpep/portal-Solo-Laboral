'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAgenda } from '@/components/portal/AgendaProvider'
import { EVENT_BLOCK } from '@/components/portal/agendaTipo'
import { anchorFromPoint } from '@/components/ui/Popover'
import {
  MINUTES_PER_DAY,
  clampMinutes,
  draftRange,
  layoutDay,
  spanOf,
} from '@/lib/agenda/layout'
import {
  formatTime,
  minutesOfDay,
  nowIso,
  plainDateOf,
  timeFromMinutes,
  today as hoyDelDespacho,
  weekdayShort,
} from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import type { AgendaEvent } from '@/lib/domain/types'

/** Alto de una hora. Con menos, media hora deja de ser clicable. */
const HOUR_PX = 56
const GUTTER = 'w-14'

/**
 * REJILLA POR HORAS — vistas de SEMANA y de DÍA.
 *
 * Las dos son la misma rejilla con distinto número de columnas, y a propósito:
 * lo único que cambia entre ver un día y ver siete es cuántas columnas caben.
 * Mantenerlas como dos componentes distintos habría duplicado el arrastre, el
 * reparto de anchos y la línea de la hora actual.
 *
 * Aquí se agenda como en cualquier calendario: se arrastra sobre el hueco y sale
 * el globo con esa franja ya puesta. El arrastre con el ratón engancha a 15
 * minutos; en pantalla táctil NO se arrastra —eso es hacer scroll— y un toque
 * agenda una hora desde donde se tocó.
 */
export function AgendaRejilla({
  days,
  events,
  compacta = false,
}: {
  days: PlainDate[]
  events: AgendaEvent[]
  /** La vista de día no necesita ancho mínimo: tiene una sola columna. */
  compacta?: boolean
}) {
  const { crear, abrir } = useAgenda()
  const cuerpoRef = useRef<HTMLDivElement>(null)

  // Franja que se está arrastrando. Vive en la rejilla y no en cada columna:
  // solo puede haber una a la vez.
  const [trazo, setTrazo] = useState<{ day: PlainDate; desde: number; hasta: number } | null>(null)
  const arrastrando = useRef(false)
  const ignorarClic = useRef(false)

  // El ahora se resuelve después de montar: pintarlo en el servidor daría una
  // hora que ya es vieja cuando llega al navegador, y encima descuadraría la
  // hidratación.
  const [ahora, setAhora] = useState<{ day: PlainDate; minutos: number } | null>(null)
  useEffect(() => {
    const leer = () => setAhora({ day: hoyDelDespacho(), minutos: minutesOfDay(nowIso()) })
    leer()
    const id = window.setInterval(leer, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const porDia = useMemo(() => {
    const mapa = new Map<PlainDate, ReturnType<typeof colocar>>()
    for (const day of days) {
      mapa.set(
        day,
        colocar(events.filter((evento) => plainDateOf(evento.startAt) === day)),
      )
    }
    return mapa
  }, [days, events])

  /**
   * La rejilla abre donde hay algo que ver: la primera actividad del rango, o
   * las 7 de la mañana. Abrir a medianoche obligaría a bajar a mano cada vez.
   */
  useEffect(() => {
    const cuerpo = cuerpoRef.current
    if (!cuerpo) return
    const primeras = events.map((evento) => minutesOfDay(evento.startAt))
    const inicio = primeras.length > 0 ? Math.min(...primeras) : 7 * 60
    cuerpo.scrollTop = Math.max(0, ((inicio - 30) / 60) * HOUR_PX)
    // Solo al entrar y al cambiar de rango: reencuadrar en cada repintado
    // devolvería la vista al principio después de cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], days.length])

  const minutosDesdeY = (y: number) => clampMinutes((y / HOUR_PX) * 60)

  const abrirAlta = (day: PlainDate, desde: number, hasta: number, x: number, y: number) => {
    const rango = draftRange(desde, hasta)
    crear(
      {
        day,
        startTime: timeFromMinutes(rango.startMin),
        endTime: timeFromMinutes(rango.endMin),
      },
      anchorFromPoint(x, y),
    )
  }

  return (
    <div className="sl-card sl-in overflow-hidden">
      <div className="overflow-x-auto">
        <div className={clsx(compacta ? 'min-w-0' : 'min-w-[44rem]')}>
          {/* ───────────────────── encabezado de columnas ───────────────────── */}
          <div className="flex border-b border-sl-border bg-sl-background">
            <div className={clsx(GUTTER, 'shrink-0')} />
            <div className="flex flex-1">
              {days.map((day) => {
                const esHoy = ahora?.day === day
                return (
                  <div
                    key={day}
                    className="min-w-0 flex-1 border-l border-sl-border px-1 py-2 text-center"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sl-muted">
                      {weekdayShort(day)}
                    </div>
                    <div
                      className={clsx(
                        'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums',
                        esHoy ? 'bg-sl-primary font-semibold text-white' : 'text-sl-text',
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ──────────────────────────── el cuerpo ─────────────────────────── */}
          <div ref={cuerpoRef} className="max-h-[62vh] overflow-y-auto">
            <div className="flex">
              {/* Las horas. La etiqueta se sube media línea para quedar sobre el
                  filete, como en cualquier agenda de papel. */}
              <div className={clsx(GUTTER, 'shrink-0')}>
                {Array.from({ length: 24 }, (_, hora) => (
                  <div key={hora} className="relative" style={{ height: HOUR_PX }}>
                    {hora === 0 ? null : (
                      <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-sl-muted">
                        {String(hora).padStart(2, '0')}:00
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-1">
                {days.map((day) => {
                  const colocados = porDia.get(day) ?? []
                  const enTrazo = trazo?.day === day ? draftRange(trazo.desde, trazo.hasta) : null
                  const lineaAhora = ahora?.day === day ? ahora.minutos : null

                  return (
                    <div
                      key={day}
                      className="relative min-w-0 flex-1 border-l border-sl-border"
                      style={{ height: 24 * HOUR_PX }}
                    >
                      {/* Capa de fondo: las líneas de hora y el gesto de crear.
                          Los bloques van encima, así que apretar sobre una cita
                          nunca empieza un arrastre. */}
                      <div
                        className="absolute inset-0 cursor-cell"
                        role="presentation"
                        onPointerDown={(event) => {
                          if (event.pointerType !== 'mouse' || event.button !== 0) return
                          const rect = event.currentTarget.getBoundingClientRect()
                          const minuto = minutosDesdeY(event.clientY - rect.top)
                          event.currentTarget.setPointerCapture(event.pointerId)
                          arrastrando.current = true
                          setTrazo({ day, desde: minuto, hasta: minuto })
                        }}
                        onPointerMove={(event) => {
                          if (!arrastrando.current) return
                          const rect = event.currentTarget.getBoundingClientRect()
                          const minuto = minutosDesdeY(event.clientY - rect.top)
                          setTrazo((previo) => (previo ? { ...previo, hasta: minuto } : previo))
                        }}
                        onPointerUp={(event) => {
                          if (!arrastrando.current || !trazo) return
                          arrastrando.current = false
                          ignorarClic.current = true
                          setTrazo(null)
                          abrirAlta(day, trazo.desde, trazo.hasta, event.clientX, event.clientY)
                        }}
                        onPointerCancel={() => {
                          arrastrando.current = false
                          setTrazo(null)
                        }}
                        onClick={(event) => {
                          // Con ratón ya lo resolvió el `pointerup`; este clic es
                          // el toque de una pantalla táctil, donde arrastrar es
                          // hacer scroll y no se puede usar para agendar.
                          if (ignorarClic.current) {
                            ignorarClic.current = false
                            return
                          }
                          const rect = event.currentTarget.getBoundingClientRect()
                          const minuto = minutosDesdeY(event.clientY - rect.top)
                          abrirAlta(day, minuto, minuto, event.clientX, event.clientY)
                        }}
                      >
                        {Array.from({ length: 24 }, (_, hora) => (
                          <div
                            key={hora}
                            className="border-b border-sl-border/70"
                            style={{ height: HOUR_PX }}
                          />
                        ))}
                      </div>

                      {/* La franja que se está arrastrando, con su hora: sin ella
                          uno suelta a ciegas y corrige después. */}
                      {enTrazo ? (
                        <div
                          className="pointer-events-none absolute inset-x-1 rounded-sl border border-sl-primary
                            bg-sl-primary/20 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-sl-primary"
                          style={{
                            top: (enTrazo.startMin / 60) * HOUR_PX,
                            height: Math.max(((enTrazo.endMin - enTrazo.startMin) / 60) * HOUR_PX, 18),
                          }}
                        >
                          {timeFromMinutes(enTrazo.startMin)} – {timeFromMinutes(enTrazo.endMin)}
                        </div>
                      ) : null}

                      {/* Los bloques. */}
                      <div className="pointer-events-none absolute inset-0">
                        {colocados.map(({ event, startMin, endMin, column, columns }) => {
                          const alto = Math.max(((endMin - startMin) / 60) * HOUR_PX - 2, 20)
                          const done = event.status === 'done'
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={(clic) =>
                                abrir(event, anchorFromPoint(clic.clientX, clic.clientY))
                              }
                              className={clsx(
                                'pointer-events-auto absolute overflow-hidden rounded-[4px] border-l-4 px-1.5 py-0.5 text-left',
                                'transition-shadow hover:shadow-sl focus-visible:shadow-sl',
                                done
                                  ? 'border-l-sl-muted bg-sl-background text-sl-muted'
                                  : EVENT_BLOCK[event.eventType],
                              )}
                              style={{
                                top: (startMin / 60) * HOUR_PX + 1,
                                height: alto,
                                left: `calc(${(column / columns) * 100}% + 2px)`,
                                width: `calc(${100 / columns}% - 4px)`,
                              }}
                              title={`${formatTime(event.startAt)} · ${event.title}`}
                            >
                              <span
                                className={clsx(
                                  'block truncate text-[11px] font-semibold leading-tight',
                                  done && 'line-through',
                                )}
                              >
                                {event.title}
                              </span>
                              {alto > 28 ? (
                                <span className="block truncate text-[10px] leading-tight opacity-80">
                                  <span className="tabular-nums">{formatTime(event.startAt)}</span>
                                  {event.clientName ? ` · ${event.clientName}` : ''}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      {/* Dónde va el día ahora mismo. */}
                      {lineaAhora !== null ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-sl-danger"
                          style={{ top: (lineaAhora / 60) * HOUR_PX }}
                          aria-hidden
                        >
                          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-sl-danger" />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-sl-border bg-sl-background px-4 py-2 text-xs text-sl-muted">
        Arrastra sobre un hueco para agendar ahí, o toca la hora. Toca una actividad para verla y
        cerrarla.
        <span className="sr-only">
          {' '}
          También puedes usar el botón Nueva actividad, que abre el mismo formulario.
        </span>
      </p>
    </div>
  )
}

/** Cada evento del día con su tramo pintable y la columna que le toca. */
function colocar(delDia: AgendaEvent[]) {
  const spans = delDia.map((event) => {
    const { startMin, endMin } = spanOf(
      minutesOfDay(event.startAt),
      event.endAt ? Math.min(minutesOfDay(event.endAt) || MINUTES_PER_DAY, MINUTES_PER_DAY) : null,
    )
    return { id: event.id, startMin, endMin }
  })
  const colocados = layoutDay(spans)
  const porId = new Map(delDia.map((event) => [event.id, event]))
  return colocados.flatMap((puesto) => {
    const event = porId.get(puesto.id)
    return event ? [{ ...puesto, event }] : []
  })
}
