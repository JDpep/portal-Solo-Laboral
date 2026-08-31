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
  formatWeekRange,
  instantFrom,
  isPlainDate,
  nowIso,
  startOfMonth,
  startOfWeek,
  today,
} from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'
import { EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { AgendaEventRow } from '@/components/portal/AgendaEventRow'
import { AgendaProvider } from '@/components/portal/AgendaProvider'
import { AgendaMes } from '@/components/portal/AgendaMes'
import { AgendaRejilla } from '@/components/portal/AgendaRejilla'
import { NuevaActividad } from '@/components/portal/NuevaActividad'
import { EVENT_DOT } from '@/components/portal/agendaTipo'
import { VistaSwitch, esVista } from '@/components/portal/VistaSwitch'
import type { VistaAgenda } from '@/components/portal/VistaSwitch'
import type { AgendaEvent, EventType } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

/**
 * CALENDARIO.
 *
 * Tres formas de mirar lo mismo, porque son tres preguntas distintas: el MES
 * responde "¿cómo viene?", la SEMANA "¿dónde me cabe esto?" y el DÍA "¿qué me
 * toca hoy?". La semana y el día se pintan por horas —donde de verdad se ve si
 * dos citas chocan— y el mes se queda en rejilla, porque veinticuatro horas por
 * treinta días no caben en una pantalla y sería ilegible.
 *
 * Las tres agendan igual: el mismo globo, con los mismos campos, salga de donde
 * salga. Lo único que cambia es el gesto que lo abre —la hora que se arrastra en
 * la rejilla, el `+` de una celda del mes, el botón de la barra— y la hora que
 * viene puesta.
 *
 * El día elegido y la vista viajan en la dirección: el calendario se puede
 * guardar, mandar y recargar sin perder dónde estaba.
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
  const uno = (key: string) => {
    const raw = searchParams[key]
    return Array.isArray(raw) ? raw[0] : raw
  }
  const fecha = (key: string) => {
    const value = uno(key)
    return value && isPlainDate(value) ? value : undefined
  }

  const vistaCruda = uno('vista')
  const vista: VistaAgenda = esVista(vistaCruda) ? vistaCruda : 'mes'
  // `mes` es de la versión anterior de esta pantalla: se sigue aceptando para
  // que un enlace guardado no caiga en un mes cualquiera.
  const dia = fecha('dia') ?? fecha('mes') ?? hoy
  const primero = startOfMonth(dia)

  // Cada vista trae su propio rango; el resto de la pantalla no vuelve a
  // preguntar por la vista para saber qué está mirando.
  const { desde, hasta, titulo, anterior, siguiente } = rango(vista, dia)

  const [eventos, casos, usuarios] = await Promise.all([
    listAgenda({ from: instantFrom(desde, '00:00'), to: instantFrom(hasta, '00:00') }),
    listCases({ scope: 'open', pageSize: 100 }),
    listActiveUsers(),
  ])

  // Lo atrasado solo tiene sentido junto a hoy: en el marzo que viene no es un
  // pendiente, es historia.
  const hoyEnRango = desde <= hoy && hoy < hasta
  const atrasados: AgendaEvent[] = hoyEnRango ? await listOverdue(nowIso()) : []

  const dias: PlainDate[] = []
  for (let cursor = desde; cursor < hasta; cursor = addDays(cursor, 1)) dias.push(cursor)

  const enVista =
    vista === 'mes'
      ? eventos.filter((evento) => evento.startAt >= instantFrom(primero, '00:00') &&
          evento.startAt < instantFrom(addMonths(primero, 1), '00:00'))
      : eventos

  const delDia = eventos.filter(
    (evento) =>
      evento.startAt >= instantFrom(dia, '00:00') &&
      evento.startAt < instantFrom(addDays(dia, 1), '00:00'),
  )

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Todo lo agendado del despacho. Se llena solo con lo que piden los prospectos y con las fechas de la ruta, y puedes añadir actividades a mano."
        actions={<RefreshButton />}
      />

      <AgendaProvider
        users={usuarios}
        cases={casos.rows.map((row) => ({
          id: row.id,
          label: `${row.folio} · ${row.clientName}`,
        }))}
      >
        {/* ──────────────────────────── navegación ─────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link
              href={`/portal/calendario?vista=${vista}&dia=${anterior}`}
              scroll={false}
              className="sl-btn-secondary px-2.5"
              aria-label={ETIQUETA_ANTERIOR[vista]}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={`/portal/calendario?vista=${vista}&dia=${siguiente}`}
              scroll={false}
              className="sl-btn-secondary px-2.5"
              aria-label={ETIQUETA_SIGUIENTE[vista]}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <h2 className="text-lg font-semibold text-sl-text first-letter:uppercase">{titulo}</h2>
          <span className="text-sm text-sl-muted">
            {enVista.length === 1 ? '1 actividad' : `${enVista.length} actividades`}
          </span>

          {hoyEnRango ? null : (
            <Link
              href={`/portal/calendario?vista=${vista}&dia=${hoy}`}
              scroll={false}
              className="sl-btn-secondary"
            >
              Ir a hoy
            </Link>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <VistaSwitch vista={vista} dia={dia} />
            <NuevaActividad defaultDay={dia} />
          </div>
        </div>

        <RefreshDim>
          {/* ────────────────────────── atrasados ─────────────────────────── */}
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

          {/* ─────────────────────────── la vista ─────────────────────────── */}
          {vista === 'mes' ? (
            <AgendaMes days={dias} month={primero} selected={dia} today={hoy} events={eventos} />
          ) : (
            <AgendaRejilla days={dias} events={eventos} compacta={vista === 'dia'} />
          )}

          {/* ───────────────────── el día elegido, en el mes ───────────────── */}
          {vista === 'mes' ? (
            <section className="sl-card mt-4 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border px-5 py-3">
                <h2 className="text-sm font-semibold text-sl-text first-letter:uppercase">
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
          ) : null}

          {/* Qué significa cada color. Sin esto los puntos son adivinanzas. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-sl-muted">
            {(['meeting', 'call', 'hearing', 'deadline', 'follow_up'] as EventType[]).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className={clsx('h-2 w-2 rounded-full', EVENT_DOT[type])} aria-hidden />
                {EVENT_TYPE_LABEL[type]}
              </span>
            ))}
          </div>
        </RefreshDim>
      </AgendaProvider>
    </>
  )
}

const ETIQUETA_ANTERIOR: Record<VistaAgenda, string> = {
  mes: 'Mes anterior',
  semana: 'Semana anterior',
  dia: 'Día anterior',
}

const ETIQUETA_SIGUIENTE: Record<VistaAgenda, string> = {
  mes: 'Mes siguiente',
  semana: 'Semana siguiente',
  dia: 'Día siguiente',
}

/**
 * El rango que pinta cada vista, su título y a dónde llevan las flechas.
 *
 * El mes arranca el lunes de la semana del día 1 y termina el domingo de la
 * semana del último día: los huecos de los meses vecinos se pintan en gris en
 * vez de dejar celdas vacías que rompen la lectura de la cuadrícula.
 */
function rango(
  vista: VistaAgenda,
  dia: PlainDate,
): { desde: PlainDate; hasta: PlainDate; titulo: string; anterior: PlainDate; siguiente: PlainDate } {
  if (vista === 'dia') {
    return {
      desde: dia,
      hasta: addDays(dia, 1),
      titulo: formatDateLong(dia),
      anterior: addDays(dia, -1),
      siguiente: addDays(dia, 1),
    }
  }

  if (vista === 'semana') {
    const lunes = startOfWeek(dia)
    return {
      desde: lunes,
      hasta: addDays(lunes, 7),
      titulo: formatWeekRange(lunes),
      anterior: addDays(dia, -7),
      siguiente: addDays(dia, 7),
    }
  }

  const primero = startOfMonth(dia)
  const siguienteMes = addMonths(primero, 1)
  return {
    desde: startOfWeek(primero),
    hasta: addDays(startOfWeek(addDays(siguienteMes, -1)), 7),
    titulo: formatMonthLong(primero),
    anterior: addMonths(dia, -1),
    siguiente: addMonths(dia, 1),
  }
}
