import Link from 'next/link'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listCases } from '@/lib/db/cases'
import type { CaseSortKey } from '@/lib/db/cases'
import { formatDate, formatDateTime } from '@/lib/dates'
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { SortHeader } from '@/components/ui/SortHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { Pagination } from '@/components/ui/Pagination'
import { TBody, TD, THead, TR } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/States'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Progress } from '@/components/portal/Progress'

export const dynamic = 'force-dynamic'

const SORT_KEYS: CaseSortKey[] = ['folio', 'openedAt', 'clientName', 'status']

/**
 * SEGUIMIENTO — los casos que requieren trabajo.
 *
 * Es la otra mitad del portal: Leads es gente por revisar, esto es trabajo ya
 * comprometido. Por eso los casos cerrados no salen aquí sino en el Histórico;
 * una lista de trabajo que incluye lo terminado deja de servir para decidir
 * qué hacer hoy.
 *
 * "Etapa actual" y "próxima acción" son el mismo dato y se muestran una vez:
 * la etapa ES el primer paso sin terminar de la ruta. Repartirlo en dos
 * columnas habría enseñado dos veces lo mismo con nombres distintos.
 */
export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()

  const params = flatten(searchParams)
  const sort = (SORT_KEYS.includes(params.sort as CaseSortKey) ? params.sort : 'openedAt') as CaseSortKey
  const direction = params.dir === 'asc' ? 'asc' : 'desc'

  const result = await listCases({
    query: params.q,
    scope: 'open',
    sort,
    direction,
    page: Number(params.page ?? '1') || 1,
    pageSize: 25,
  })

  const sortParams = { ...params, page: undefined }

  return (
    <>
      <PageHeader
        title="Seguimiento"
        description="Casos abiertos y en qué punto de su ruta está cada uno."
        actions={<RefreshButton />}
      />

      <div className="mb-4">
        <SearchInput label="Buscar por cliente, folio o teléfono" placeholder="Buscar…" />
      </div>

      <RefreshDim>
        {result.total === 0 ? (
          <div className="sl-card">
            <EmptyState
              title={params.q ? 'Sin resultados' : 'No hay casos en seguimiento'}
              description={
                params.q
                  ? 'Prueba con otro nombre, folio o número.'
                  : 'Un caso nace cuando conviertes un lead desde su ficha. Hasta entonces, el trabajo está en Leads.'
              }
              action={
                params.q ? null : (
                  <Link href="/portal" className="sl-btn-secondary">
                    Ir a Leads
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
                        <Badge tone={CASE_STATUS_TONE[row.status]}>
                          {CASE_STATUS_LABEL[row.status]}
                        </Badge>
                        {row.isDemo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-sl-text">
                        {row.clientName}
                      </p>
                      <p className="mt-1 text-sm text-sl-muted">
                        {row.currentStage || 'Ruta terminada'}
                      </p>
                      <div className="mt-2">
                        <Progress {...row.progress} />
                      </div>
                      {row.nextEvent ? (
                        <p className="mt-2 flex items-center gap-1.5 text-sm text-sl-secondary-strong">
                          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                          {EVENT_TYPE_LABEL[row.nextEvent.type]} ·{' '}
                          {formatDateTime(row.nextEvent.startAt)}
                        </p>
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
                basePath="/portal/seguimiento"
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
                        basePath="/portal/seguimiento"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Folio"
                        sortKey="folio"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/seguimiento"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Ingreso"
                        sortKey="openedAt"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/seguimiento"
                        params={sortParams}
                      />
                      <th scope="col" className="sl-th">Etapa actual</th>
                      <th scope="col" className="sl-th">Próximo evento</th>
                      <th scope="col" className="sl-th">Responsable</th>
                      <th scope="col" className="sl-th">Progreso</th>
                      <SortHeader
                        label="Estado"
                        sortKey="status"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal/seguimiento"
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
                          {formatDate(row.openedAt.slice(0, 10))}
                        </TD>
                        <TD>{row.currentStage || <span className="text-sl-muted">—</span>}</TD>
                        <TD className="whitespace-nowrap">
                          {row.nextEvent ? (
                            <span className="text-sl-secondary-strong">
                              {EVENT_TYPE_LABEL[row.nextEvent.type]} ·{' '}
                              {formatDateTime(row.nextEvent.startAt)}
                            </span>
                          ) : (
                            <span className="text-sl-muted">—</span>
                          )}
                        </TD>
                        <TD className="whitespace-nowrap">
                          {row.assignedUserName ?? <span className="text-sl-muted">Sin asignar</span>}
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
                basePath="/portal/seguimiento"
                params={params}
              />
            </div>
          </>
        )}
      </RefreshDim>
    </>
  )
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
