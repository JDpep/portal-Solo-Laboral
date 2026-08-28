import Link from 'next/link'
import clsx from 'clsx'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listAgenda, listOverdue } from '@/lib/db/events'
import { listCases } from '@/lib/db/cases'
import { listActiveUsers } from '@/lib/db/users'
import {
  addDays,
  addMonths,
  formatDateLong,
  formatMonthLong,
  formatTime,
  instantFrom,
  isPlainDate,
  nowIso,
  plainDateOf,
  startOfMonth,
  startOfWeek,
  today,
} from '@/lib/dates'
import { EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { AgendaEventRow } from '@/components/portal/AgendaEventRow'
import { NuevaActividad } from '@/components/portal/NuevaActividad'
import type { AgendaEvent, EventType } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** Un punto de color por tipo, para leer la rejilla sin abrir cada día. */
const DOT: Record<EventType, string> = {
  call: 'bg-sl-secondary-strong',
  hearing: 'bg-sl-warning',
  conciliation: 'bg-sl-warning',
  meeting: 'bg-sl-primary',
  follow_up: 'bg-sl-muted',
  deadline: 'bg-sl-danger',
  other: 'bg-sl-muted',
}

/**
 * CALENDARIO MENSUAL.
 *
 * El mes de un vistazo arriba, el día elegido completo abajo. La rejilla
 * responde "¿cómo viene el mes?" y el panel responde "¿qué hay ese día?"; una
 * sola de las dos no basta —en una celda de calendario no cabe de quién es la
 * cita ni su teléfono, y una lista suelta no deja ver que la semana que viene
 * está cargada.
 *
 * TRES VÍAS llenan esta agenda y no se cierran igual: la llamada que pide el
 * prospecto desde la web y la fecha de un paso de la ruta del caso se escriben
 * solas y se cierran donde nacieron; la actividad capturada aquí sí se marca
 * realizada o se cancela en esta pantalla.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()

  const hoy = today()
  const pick = (key: string) => {
    const raw = searchParams[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    return value && isPlainDate(value) ? value : undefined
  }

  const diaElegido = pick('dia')
  const mesAncla = pick('mes') ?? diaElegido ?? hoy
  const primero = startOfMonth(mesAncla)
  const siguiente = addMonths(primero, 1)

  // La rejilla empieza el lunes de la semana del día 1 y termina el domingo de
  // la semana del último día: los huecos de los meses vecinos se pintan en gris
  // en vez de dejar celdas vacías que rompen la lectura de la cuadrícula.
  const desde = startOfWeek(primero)
  const hasta = addDays(startOfWeek(addDays(siguiente, -1)), 7)

  const [eventos, atrasados, casos, usuarios] = await Promise.all([
    listAgenda({ from: instantFrom(desde, '00:00'), to: instantFrom(hasta, '00:00') }),
    startOfMonth(hoy) === primero ? listOverdue(nowIso()) : Promise.resolve([] as AgendaEvent[]),
    listCases({ scope: 'open', pageSize: 100 }),
    listActiveUsers(),
  ])

  const porDia = new Map<string, AgendaEvent[]>()
  for (const evento of eventos) {
    const clave = plainDateOf(evento.startAt)
    const lista = porDia.get(clave)
    if (lista) lista.push(evento)
    else porDia.set(clave, [evento])
  }

  // El día del panel: el elegido, o hoy si el mes en pantalla es el de hoy, o
  // el día 1. Nunca queda sin panel: un calendario que no muestra nada abajo
  // parece roto.
  const dia = diaElegido ?? (startOfMonth(hoy) === primero ? hoy : primero)
  const delDia = porDia.get(dia) ?? []

  const celdas: string[] = []
  for (let cursor = desde; cursor < hasta; cursor = addDays(cursor, 1)) celdas.push(cursor)

  const enElMes = eventos.filter((evento) =>
    plainDateOf(evento.startAt).startsWith(primero.slice(0, 7)),
  )

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Todo lo agendado del despacho. Se llena solo con lo que piden los prospectos y con las fechas de la ruta, y puedes añadir actividades a mano."
        actions={<RefreshButton />}
      />

      {/* ───────────────────────────── navegación ───────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/portal/calendario?mes=${addMonths(primero, -1)}`}
            className="sl-btn-secondary px-2.5"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={`/portal/calendario?mes=${addMonths(primero, 1)}`}
            className="sl-btn-secondary px-2.5"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <h2 className="text-lg font-semibold capitalize text-sl-text">
          {formatMonthLong(primero)}
        </h2>
        <span className="text-sm text-sl-muted">
          {enElMes.length === 1 ? '1 actividad' : `${enElMes.length} actividades`}
        </span>

        {startOfMonth(hoy) === primero ? null : (
          <Link href="/portal/calendario" className="sl-btn-secondary">
            Ir a hoy
          </Link>
        )}

        <div className="ml-auto">
          <NuevaActividad
            defaultDay={dia}
            users={usuarios}
            cases={casos.rows.map((row) => ({
              id: row.id,
              label: `${row.folio} · ${row.clientName}`,
            }))}
          />
        </div>
      </div>

      <RefreshDim>
        {/* ─────────────────────────── atrasados ──────────────────────────── */}
        {atrasados.length > 0 ? (
          <section className="sl-card sl-in mb-4 overflow-hidden border-sl-warning/40">
            <div className="flex items-center gap-2 border-b border-sl-border bg-sl-warning/10 px-5 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-sl-warning" aria-hidden />
              <h2 className="text-sm font-semibold text-sl-text">
                Pasó la hora y sigue sin cerrarse
                <span className="ml-1.5 font-normal text-sl-muted">({atrasados.length})</span>
              </h2>
            </div>
            <ul className="divide-y divide-sl-border">
              {atrasados.map((evento) => (
                <AgendaEventRow key={evento.id} event={evento} overdue />
              ))}
            </ul>
          </section>
        ) : null}

        {/* ──────────────────────────── la rejilla ─────────────────────────── */}
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
            {celdas.map((fecha) => {
              const delMes = fecha.slice(0, 7) === primero.slice(0, 7)
              const esHoy = fecha === hoy
              const activo = fecha === dia
              const lista = porDia.get(fecha) ?? []

              return (
                <Link
                  key={fecha}
                  href={`/portal/calendario?mes=${primero}&dia=${fecha}`}
                  aria-current={activo ? 'date' : undefined}
                  aria-label={`${formatDateLong(fecha)}, ${lista.length} ${
                    lista.length === 1 ? 'actividad' : 'actividades'
                  }`}
                  className={clsx(
                    'flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-sl-border p-1.5 transition-colors sm:min-h-[6rem]',
                    delMes ? 'bg-sl-surface' : 'bg-sl-background',
                    activo ? 'ring-2 ring-inset ring-sl-primary' : 'hover:bg-sl-primary-soft/50',
                  )}
                >
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

                  {/* En el móvil no cabe el título: se pintan puntos por tipo.
                      En escritorio, la hora y de quién es. */}
                  <span className="flex flex-wrap gap-0.5 sm:hidden">
                    {lista.slice(0, 4).map((evento) => (
                      <span
                        key={evento.id}
                        className={clsx('h-1.5 w-1.5 rounded-full', DOT[evento.eventType])}
                        aria-hidden
                      />
                    ))}
                  </span>

                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {lista.slice(0, 3).map((evento) => (
                      <span
                        key={evento.id}
                        className={clsx(
                          'flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-0.5 text-[10px] leading-tight',
                          evento.status === 'done'
                            ? 'text-sl-muted line-through'
                            : 'bg-sl-primary-soft/70 text-sl-text',
                        )}
                      >
                        <span
                          className={clsx(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            DOT[evento.eventType],
                          )}
                          aria-hidden
                        />
                        <span className="shrink-0 tabular-nums">{formatTime(evento.startAt)}</span>
                        <span className="truncate">{evento.clientName ?? evento.title}</span>
                      </span>
                    ))}
                    {lista.length > 3 ? (
                      <span className="px-1 text-[10px] text-sl-muted">
                        +{lista.length - 3} más
                      </span>
                    ) : null}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* ─────────────────────────── el día elegido ──────────────────────── */}
        <section className="sl-card mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border px-5 py-3">
            <h2 className="text-sm font-semibold capitalize text-sl-text">
              {formatDateLong(dia)}
              {dia === hoy ? (
                <span className="ml-2 rounded-full bg-sl-primary px-2 py-0.5 text-xs font-medium normal-case text-white">
                  Hoy
                </span>
              ) : null}
            </h2>
            <span className="text-xs text-sl-muted">
              {delDia.length === 0
                ? 'Sin nada agendado'
                : delDia.length === 1
                  ? '1 actividad'
                  : `${delDia.length} actividades`}
            </span>
          </div>

          {delDia.length === 0 ? (
            <p className="px-5 py-6 text-sm text-sl-muted">
              Nada este día. Usa <strong className="font-semibold">Nueva actividad</strong> para
              agendar algo, o ponle fecha a un paso de la ruta de un caso y aparecerá aquí solo.
            </p>
          ) : (
            <ul className="divide-y divide-sl-border">
              {delDia.map((evento) => (
                <AgendaEventRow key={evento.id} event={evento} />
              ))}
            </ul>
          )}
        </section>

        {/* Qué significa cada color. Sin esto los puntos son adivinanzas. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-sl-muted">
          {(['meeting', 'call', 'hearing', 'deadline', 'follow_up'] as EventType[]).map((type) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className={clsx('h-2 w-2 rounded-full', DOT[type])} aria-hidden />
              {EVENT_TYPE_LABEL[type]}
            </span>
          ))}
        </div>
      </RefreshDim>
    </>
  )
}
