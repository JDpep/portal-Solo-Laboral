import Link from 'next/link'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listCases } from '@/lib/db/cases'
import type { CaseSortKey } from '@/lib/db/cases'
import { listStepsForCases, findDefaultTemplate } from '@/lib/db/checklist'
import { formatDateTime } from '@/lib/dates'
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { SortHeader } from '@/components/ui/SortHeader'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { Pagination } from '@/components/ui/Pagination'
import { TBody, THead, TR } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/States'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Progress } from '@/components/portal/Progress'
import { StepCheckbox } from '@/components/portal/StepCheckbox'
import type { ChecklistItem, ChecklistTemplateItem } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const SORT_KEYS: CaseSortKey[] = ['folio', 'openedAt', 'clientName', 'status']

/**
 * SEGUIMIENTO — la cuadrícula de trabajo.
 *
 * Una fila por caso, una columna por paso de la ruta, una casilla en cada
 * cruce. Es la pantalla desde la que se avanza el trabajo sin abrir nada: se
 * marca lo que se hizo y se sigue. Antes había que entrar a cada caso para
 * mover un paso, y eso convertía "acabo de mandar los documentos de tres
 * clientes" en nueve clics y tres pantallas.
 *
 * LAS COLUMNAS SALEN DE LA PLANTILLA, no de los casos. Si vinieran de los casos,
 * cada página tendría columnas distintas según qué casos cayeran en ella y la
 * cuadrícula dejaría de poder leerse en vertical —que es justo para lo que
 * sirve: ver de un vistazo que nadie ha pedido documentación esta semana.
 *
 * Los casos cerrados no salen aquí sino en el Histórico: una lista de trabajo
 * que incluye lo terminado deja de servir para decidir qué hacer hoy.
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

  const [template, stepsByCase] = await Promise.all([
    findDefaultTemplate(),
    listStepsForCases(result.rows.map((row) => row.id)),
  ])
  const columns: ChecklistTemplateItem[] = template?.items ?? []
  const sortParams = { ...params, page: undefined }

  return (
    <>
      <PageHeader
        title="Seguimiento"
        description="Casos abiertos y en qué punto de su ruta está cada uno. Marca los pasos aquí mismo."
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
            {/* ---------- TELÉFONO: tarjetas con la tira de pasos ---------- */}
            <ul className="space-y-3 lg:hidden">
              {result.rows.map((row, i) => {
                const items = stepsByCase.get(row.id) ?? []
                return (
                  <li
                    key={row.id}
                    className="sl-card sl-in overflow-hidden"
                    style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                  >
                    <Link
                      href={`/portal/seguimiento/${row.id}`}
                      className="flex items-start gap-3 px-4 pt-4 active:bg-sl-primary-soft/50"
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

                    {/* La tira de pasos: numerada, porque en el ancho de un
                        teléfono no cabe el título de cada uno. El número
                        coincide con el orden de la ruta dentro del caso. */}
                    {columns.length > 0 ? (
                      <div className="mt-3 flex items-center gap-2 overflow-x-auto border-t border-sl-border px-4 py-3">
                        {columns.map((column, index) => (
                          <div key={column.id} className="flex shrink-0 flex-col items-center gap-1">
                            <StepCheckbox
                              caseId={row.id}
                              item={findStep(items, column)}
                              stepTitle={column.title}
                              clientName={row.clientName}
                            />
                            <span className="text-[10px] tabular-nums text-sl-muted">
                              {index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                )
              })}
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

            {/* ---------- ESCRITORIO: la cuadrícula ---------- */}
            <div className="sl-card hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
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
                      {/* Los títulos de los pasos SON los encabezados. Van
                          numerados y estrechos: la columna se lee de arriba
                          abajo buscando huecos, no de izquierda a derecha. */}
                      {columns.map((column, index) => (
                        <th
                          key={column.id}
                          scope="col"
                          className="w-24 border-l border-sl-border px-2 py-2.5 align-bottom"
                          title={column.description}
                        >
                          <span className="block text-[10px] font-semibold tabular-nums text-sl-muted">
                            {index + 1}
                          </span>
                          <span className="block text-[11px] font-semibold leading-tight text-sl-text">
                            {column.title}
                          </span>
                        </th>
                      ))}
                      <th scope="col" className="sl-th border-l border-sl-border">
                        Progreso
                      </th>
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
                    {result.rows.map((row, i) => {
                      const items = stepsByCase.get(row.id) ?? []
                      const extra = items.filter((item) => !item.templateItemId).length
                      return (
                        <TR
                          key={row.id}
                          className="sl-in"
                          style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                        >
                          <td className="px-4 py-3 align-middle">
                            <Link
                              href={`/portal/seguimiento/${row.id}`}
                              className="font-medium text-sl-text hover:text-sl-primary hover:underline"
                            >
                              {row.clientName}
                            </Link>
                            {row.isDemo ? <DemoBadge className="ml-2" /> : null}
                            <span className="mt-0.5 block font-mono text-[11px] font-semibold text-sl-primary">
                              {row.folio}
                              {row.assignedUserName ? (
                                <span className="ml-2 font-sans font-normal text-sl-muted">
                                  {row.assignedUserName}
                                </span>
                              ) : null}
                            </span>
                            {extra > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-sl-muted">
                                +{extra} paso{extra === 1 ? '' : 's'} propio
                                {extra === 1 ? '' : 's'} de este caso
                              </span>
                            ) : null}
                          </td>

                          {columns.map((column) => (
                            <td
                              key={column.id}
                              className="border-l border-sl-border px-2 py-3 align-middle"
                            >
                              <StepCheckbox
                                caseId={row.id}
                                item={findStep(items, column)}
                                stepTitle={column.title}
                                clientName={row.clientName}
                              />
                            </td>
                          ))}

                          <td className="w-36 border-l border-sl-border px-4 py-3 align-middle">
                            <Progress {...row.progress} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Badge tone={CASE_STATUS_TONE[row.status]}>
                              {CASE_STATUS_LABEL[row.status]}
                            </Badge>
                          </td>
                        </TR>
                      )
                    })}
                  </TBody>
                </table>
              </div>

              {/* Qué significa cada casilla. Sin esto, el punto ámbar y el
                  cuadro azul son adivinanzas. */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-sl-border bg-sl-background px-4 py-2.5 text-xs text-sl-muted">
                <Key className="border-sl-border bg-sl-surface">Pendiente</Key>
                <Key className="border-sl-secondary-strong bg-sl-secondary/10">En proceso</Key>
                <Key className="border-sl-success bg-sl-success">Completado</Key>
                <Key className="border-sl-border bg-sl-background">No aplica</Key>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-sl-warning" aria-hidden />
                  Con fecha en la agenda
                </span>
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

/**
 * El paso del caso que corresponde a esa columna.
 *
 * Se busca por `templateItemId` y no por posición: un caso puede llevar pasos
 * propios que corren las posiciones, y emparejar por número pondría la marca de
 * "documentación entregada" en la columna de otra cosa.
 */
function findStep(items: ChecklistItem[], column: ChecklistTemplateItem): ChecklistItem | null {
  return items.find((item) => item.templateItemId === column.id) ?? null
}

function Key({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3.5 w-3.5 rounded-[4px] border-2 ${className}`} aria-hidden />
      {children}
    </span>
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
