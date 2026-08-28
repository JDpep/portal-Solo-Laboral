import Link from 'next/link'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listAgenda, listOverdue } from '@/lib/db/events'
import {
  addDays,
  formatDateLong,
  formatMonthLong,
  instantFrom,
  isPlainDate,
  nowIso,
  plainDateOf,
  startOfWeek,
  today,
} from '@/lib/dates'
import { PageHeader } from '@/components/ui/PageHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { EmptyState } from '@/components/ui/States'
import { AgendaEventRow } from '@/components/portal/AgendaEventRow'
import type { AgendaEvent } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

/**
 * AGENDA DEL DESPACHO.
 *
 * Nadie captura un evento aquí, y no es una carencia: es la decisión. Lo que se
 * ve en esta pantalla se alimenta solo de dos sitios que ya existen —lo que el
 * prospecto pide desde la web, y la fecha que un abogado le pone a un paso de
 * la ruta del caso—. Un alta de eventos propia habría creado una tercera
 * versión de los mismos hechos, y la tercera versión es siempre la que nadie
 * actualiza.
 *
 * Por eso el vacío no dice "añade un evento": dice dónde se ponen las fechas.
 *
 * SEMANA y no mes. La pregunta que se hace un abogado al abrir esto es "¿qué
 * tengo que hacer?", y una cuadrícula mensual la responde con recuadros de
 * cinco milímetros donde no cabe de quién es cada cosa. La semana deja escribir
 * el nombre del cliente y el teléfono en el renglón.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()

  const hoy = today()
  const raw = Array.isArray(searchParams.semana) ? searchParams.semana[0] : searchParams.semana
  const anchor = raw && isPlainDate(raw) ? raw : hoy
  const inicio = startOfWeek(anchor)
  const fin = addDays(inicio, 7)

  const [eventos, atrasados] = await Promise.all([
    listAgenda({ from: instantFrom(inicio, '00:00'), to: instantFrom(fin, '00:00') }),
    // Los atrasados solo estorban cuando se está mirando otra semana: quien
    // navega al futuro está planeando, no recogiendo lo que quedó suelto.
    startOfWeek(hoy) === inicio ? listOverdue(nowIso()) : Promise.resolve([] as AgendaEvent[]),
  ])

  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicio, i))
  const porDia = new Map<string, AgendaEvent[]>()
  for (const evento of eventos) {
    const dia = plainDateOf(evento.startAt)
    const lista = porDia.get(dia)
    if (lista) lista.push(evento)
    else porDia.set(dia, [evento])
  }

  const esSemanaActual = startOfWeek(hoy) === inicio

  return (
    <>
      <PageHeader
        title="Calendario"
        description="La semana del despacho. Se llena sola: llamadas pedidas desde la web y fechas puestas en la ruta de cada caso."
        actions={<RefreshButton />}
      />

      {/* ───────────────────────────── navegación ───────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/portal/calendario?semana=${addDays(inicio, -7)}`}
            className="sl-btn-secondary px-2.5"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={`/portal/calendario?semana=${addDays(inicio, 7)}`}
            className="sl-btn-secondary px-2.5"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {esSemanaActual ? null : (
          <Link href="/portal/calendario" className="sl-btn-secondary">
            Volver a esta semana
          </Link>
        )}

        <p className="text-sm text-sl-muted">
          <span className="font-medium text-sl-text">
            {formatDateLong(inicio)} — {formatDateLong(addDays(inicio, 6))}
          </span>
          <span className="hidden sm:inline"> · {formatMonthLong(inicio)}</span>
          {' · '}
          {eventos.length === 1 ? '1 evento' : `${eventos.length} eventos`}
        </p>
      </div>

      <RefreshDim>
        {/* ─────────────────────────── atrasados ──────────────────────────── */}
        {atrasados.length > 0 ? (
          <section className="sl-card sl-in mb-5 overflow-hidden border-sl-warning/40">
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

        {/* ──────────────────────────── la semana ─────────────────────────── */}
        {eventos.length === 0 ? (
          <div className="sl-card">
            <EmptyState
              title="Nada agendado esta semana"
              description="La agenda no se captura: se llena sola. Una llamada aparece cuando el prospecto la pide desde la web; una audiencia aparece cuando le pones fecha a su paso en la ruta del caso."
              action={
                <Link href="/portal/seguimiento" className="sl-btn-secondary">
                  Ir a Seguimiento
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {dias.map((dia, i) => {
              const delDia = porDia.get(dia) ?? []
              const esHoy = dia === hoy
              return (
                <section
                  key={dia}
                  className="sl-card sl-in overflow-hidden"
                  style={{ animationDelay: `${Math.min(i, 7) * 35}ms` }}
                >
                  <div
                    className={
                      esHoy
                        ? 'flex items-center gap-2 border-b border-sl-border bg-sl-primary-soft px-5 py-2.5'
                        : 'flex items-center gap-2 border-b border-sl-border px-5 py-2.5'
                    }
                  >
                    <CalendarDays
                      className={esHoy ? 'h-4 w-4 text-sl-primary' : 'h-4 w-4 text-sl-muted'}
                      aria-hidden
                    />
                    <h2
                      className={
                        esHoy
                          ? 'text-sm font-semibold capitalize text-sl-primary'
                          : 'text-sm font-semibold capitalize text-sl-text'
                      }
                    >
                      {formatDateLong(dia)}
                    </h2>
                    {esHoy ? (
                      <span className="rounded-full bg-sl-primary px-2 py-0.5 text-xs font-medium text-white">
                        Hoy
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-sl-muted">
                      {delDia.length === 0
                        ? '—'
                        : delDia.length === 1
                          ? '1 evento'
                          : `${delDia.length} eventos`}
                    </span>
                  </div>

                  {delDia.length === 0 ? (
                    <p className="px-5 py-3 text-sm text-sl-muted">Sin nada agendado.</p>
                  ) : (
                    <ul className="divide-y divide-sl-border">
                      {delDia.map((evento) => (
                        <AgendaEventRow key={evento.id} event={evento} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </RefreshDim>
    </>
  )
}
