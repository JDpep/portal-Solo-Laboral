import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { closedCaseMetrics, listCases } from '@/lib/db/cases'
import type { CaseSortKey } from '@/lib/db/cases'
import { daysBetween, formatDate, formatDateTime, plainDateOf } from '@/lib/dates'
import {
  CASE_CLOSE_REASON_LABEL,
  CASE_CLOSE_REASON_SHORT,
  CASE_CLOSE_REASON_TONE,
  CASE_STATUS_LABEL,
  CASE_STATUS_TONE,
} from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { SortHeader } from '@/components/ui/SortHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { Pagination } from '@/components/ui/Pagination'
import { TBody, TD, THead, TR } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/States'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Progress } from '@/components/portal/Progress'
import { Bar, Stat } from '@/components/portal/Stat'
import type { CaseCloseReason, CaseSummary } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const SORT_KEYS: CaseSortKey[] = ['folio', 'openedAt', 'closedAt', 'clientName', 'status']

const REASONS: CaseCloseReason[] = [
  'completed',
  'client_declined',
  'client_unresponsive',
  'not_viable',
  'other',
]

/**
 * HISTÓRICO — los casos que ya terminaron, y lo que se aprende de ellos.
 *
 * No es una base aparte ni un archivo muerto: es la misma tabla de casos vista
 * por el otro lado. Un caso cerrado conserva su ruta, sus eventos, su historia
 * y su motivo de cierre, y se abre en la misma ficha técnica que cuando estaba
 * vivo —en modo consulta— con su botón de reabrir. Por eso aquí no hay una
 * pantalla de detalle propia: habría sido una segunda versión de la misma.
 *
 * LOS INDICADORES RESPETAN EL FILTRO. Si dieran siempre el total del histórico
 * mientras la tabla de abajo muestra un filtro, la pantalla afirmaría dos cosas
 * a la vez y ninguna se podría comprobar contando los renglones.
 *
 * Y no se muestra ninguna tasa de éxito. "8 de 12 concluidos" es un hecho;
 * llamarlo 67 % de éxito convierte en calificación del despacho algo que
 * depende sobre todo de a cuánta gente le dejó de convenir seguir.
 */
export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()

  const params = flatten(searchParams)
  const sort = (SORT_KEYS.includes(params.sort as CaseSortKey) ? params.sort : 'closedAt') as CaseSortKey
  const direction = params.dir === 'asc' ? 'asc' : 'desc'
  const closeReason = REASONS.includes(params.motivo as CaseCloseReason)
    ? (params.motivo as CaseCloseReason)
    : undefined

  const filter = { query: params.q, closeReason, scope: 'closed' as const }
  const [result, metrics] = await Promise.all([
    listCases({
      ...filter,
      sort,
      direction,
      page: Number(params.page ?? '1') || 1,
      pageSize: 25,
    }),
    closedCaseMetrics(filter),
  ])

  // El reparto por motivo se cuenta SIN el filtro de motivo: si se filtrara por
  // él, el desglose mostraría siempre una sola barra al 100 % y dejaría de
  // servir para lo único que sirve, que es poder saltar de un motivo a otro.
  const spread = closeReason ? await closedCaseMetrics({ query: params.q, scope: 'closed' }) : metrics

  const sortParams = { ...params, page: undefined }
  const linkFor = (reason?: CaseCloseReason) => {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (reason) query.set('motivo', reason)
    const suffix = query.toString()
    return suffix ? `/portal/historico?${suffix}` : '/portal/historico'
  }

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Los casos que ya terminaron, con su motivo de cierre y su ruta completa."
        actions={<RefreshButton />}
      />

      {/* ───────────────────────────── indicadores ──────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={closeReason ? 'Cerrados con este motivo' : 'Casos cerrados'}
          value={metrics.total}
          hint={
            closeReason
              ? `de ${spread.total} en el histórico`
              : params.q
                ? 'que coinciden con la búsqueda'
                : 'desde que arrancó el portal'
          }
        />
        <Stat
          label="Concluidos"
          value={metrics.byReason.completed}
          tone={metrics.byReason.completed > 0 ? 'success' : 'muted'}
          hint={
            metrics.total > 0
              ? `de ${metrics.total} cerrados`
              : 'todavía ninguno'
          }
        />
        <Stat
          label="Duración típica"
          value={metrics.medianDays === null ? '—' : `${metrics.medianDays} d`}
          tone={metrics.medianDays === null ? 'muted' : 'neutral'}
          hint={
            metrics.medianDays === null
              ? 'hacen falta casos cerrados'
              : // Mediana y no promedio: un caso de dos años arrastraría la media.
                `mediana · entre ${metrics.shortestDays} y ${metrics.longestDays} días`
          }
        />
        <Stat
          label="Ruta completada"
          value={
            metrics.stepsTotal === 0
              ? '—'
              : `${Math.round((metrics.stepsDone / metrics.stepsTotal) * 100)}%`
          }
          tone={metrics.stepsTotal === 0 ? 'muted' : 'neutral'}
          hint={
            metrics.stepsTotal === 0
              ? 'sin pasos que contar'
              : `${metrics.stepsDone} de ${metrics.stepsTotal} pasos`
          }
        />
      </div>

      {/* ──────────────────────── reparto por motivo ────────────────────────── */}
      {spread.total > 0 ? (
        <section className="sl-card mb-4 px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="sl-eyebrow">Por qué terminaron</h2>
            {closeReason ? (
              <Link href={linkFor()} className="text-xs text-sl-primary hover:underline">
                Quitar el filtro
              </Link>
            ) : (
              <span className="text-xs text-sl-muted">Toca un motivo para filtrar</span>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            {REASONS.map((reason) => (
              <Bar
                key={reason}
                label={CASE_CLOSE_REASON_LABEL[reason]}
                value={spread.byReason[reason]}
                total={spread.total}
                href={linkFor(closeReason === reason ? undefined : reason)}
                active={closeReason === reason}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-4">
        <SearchInput label="Buscar por cliente, folio o teléfono" placeholder="Buscar…" />
      </div>

      <RefreshDim>
        {result.total === 0 ? (
          <div className="sl-card">
            <EmptyState
              title={
                params.q || closeReason ? 'Sin resultados' : 'Todavía no hay casos cerrados'
              }
              description={
                params.q || closeReason
                  ? 'Prueba con otro nombre, folio o motivo.'
                  : 'Un caso llega aquí cuando finalizas su seguimiento. No se borra nada: conserva su ruta, su agenda y su historia, y se puede reabrir.'
              }
              action={
                params.q || closeReason ? (
                  <Link href={linkFor()} className="sl-btn-secondary">
                    Ver todo el histórico
                  </Link>
                ) : (
                  <Link href="/portal/seguimiento" className="sl-btn-secondary">
                    Ir a Seguimiento
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            {/* ---------- TELÉFONO: tarjetas ---------- */}
            <ul className="space-y-3 lg:hidden">
              {result.rows.map((row, i) => (
                <li
                  key={row.id}
                  className="sl-card sl-in overflow-hidden"
                  style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                >
                  <Link
                    href={`/portal/seguimiento/${row.id}`}
                    className="flex items-start gap-3 p-4 active:bg-sl-primary-soft/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-sl-primary">
                          {row.folio}
                        </span>
                        {row.closedReason ? (
                          <Badge tone={CASE_CLOSE_REASON_TONE[row.closedReason]}>
                            {CASE_CLOSE_REASON_SHORT[row.closedReason]}
                          </Badge>
                        ) : null}
                        {row.isDemo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-sl-text">
                        {row.clientName}
                      </p>
                      <p className="mt-1 text-sm text-sl-muted">
                        Cerrado el {formatDate(plainDateOf(row.closedAt ?? row.openedAt))} ·{' '}
                        {duracion(row)}
                      </p>
                      <div className="mt-2">
                        <Progress {...row.progress} />
                      </div>
                      {row.closedNote ? (
                        <p className="mt-2 line-clamp-2 text-sm text-sl-muted">{row.closedNote}</p>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-sl-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-1 lg:hidden">
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                basePath="/portal/historico"
                params={params}
              />
            </div>

            {/* ---------- ESCRITORIO: tabla ---------- */}
            <div className="sl-card hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] border-collapse">
                  <THead>
                    <TR>
                      <SortHeader
                        label="Cliente"
                        sortKey="clientName"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/historico"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Folio"
                        sortKey="folio"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/historico"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Ingreso"
                        sortKey="openedAt"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/historico"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Cierre"
                        sortKey="closedAt"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/historico"
                        params={sortParams}
                      />
                      <th scope="col" className="sl-th">Duró</th>
                      <th scope="col" className="sl-th">Motivo</th>
                      <th scope="col" className="sl-th">Ruta</th>
                      <SortHeader
                        label="Estado"
                        sortKey="status"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/historico"
                        params={sortParams}
                      />
                    </TR>
                  </THead>
                  <TBody>
                    {result.rows.map((row, i) => (
                      <TR
                        key={row.id}
                        className="sl-in"
                        style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                      >
                        <TD className="font-medium">
                          <Link
                            href={`/portal/seguimiento/${row.id}`}
                            className="text-sl-text hover:text-sl-primary hover:underline"
                          >
                            {row.clientName}
                          </Link>
                          {row.isDemo ? <DemoBadge className="ml-2" /> : null}
                        </TD>
                        <TD className="whitespace-nowrap font-mono text-xs font-semibold text-sl-primary">
                          {row.folio}
                        </TD>
                        <TD className="whitespace-nowrap text-sl-muted">
                          {formatDate(plainDateOf(row.openedAt))}
                        </TD>
                        <TD className="whitespace-nowrap text-sl-muted">
                          {row.closedAt ? formatDateTime(row.closedAt) : '—'}
                        </TD>
                        <TD className="whitespace-nowrap tabular-nums">{duracion(row)}</TD>
                        <TD>
                          {row.closedReason ? (
                            <>
                              <Badge tone={CASE_CLOSE_REASON_TONE[row.closedReason]}>
                                {CASE_CLOSE_REASON_SHORT[row.closedReason]}
                              </Badge>
                              {/* La nota es lo que hace consultable el histórico
                                  seis meses después; sin ella queda un motivo
                                  de catálogo y nada más. */}
                              {row.closedNote ? (
                                <span className="mt-0.5 block max-w-xs truncate text-xs text-sl-muted">
                                  {row.closedNote}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-sl-muted">—</span>
                          )}
                        </TD>
                        <TD className="w-40">
                          <Progress {...row.progress} />
                        </TD>
                        <TD>
                          <Badge tone={CASE_STATUS_TONE[row.status]}>
                            {CASE_STATUS_LABEL[row.status]}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </table>
              </div>
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                basePath="/portal/historico"
                params={params}
              />
            </div>
          </>
        )}
      </RefreshDim>
    </>
  )
}

/**
 * Cuánto estuvo abierto, en días civiles.
 *
 * Se cuenta por fecha y no por horas: "duró 3 días" es lo que se dice en una
 * junta, y redondear 71 horas a 2 días haría que la tabla contradijera a
 * cualquiera que restara las dos fechas de las columnas de al lado.
 */
function duracion(row: CaseSummary): string {
  if (!row.closedAt) return '—'
  const days = daysBetween(plainDateOf(row.openedAt), plainDateOf(row.closedAt))
  if (days <= 0) return 'mismo día'
  return `${days} ${days === 1 ? 'día' : 'días'}`
}

function flatten(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    out[key] = Array.isArray(value) ? value[0] : value
  }
  return out
}
