import Link from 'next/link'
import clsx from 'clsx'
import { ChevronRight, FileWarning, Paperclip, Plus } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listSettlements, settlementMetrics, type ListSettlementsOptions } from '@/lib/db/settlements'
import { addDays, addMonths, formatDate, startOfMonth, today } from '@/lib/dates'
import { formatMoney, formatMoneyShort, formatRate } from '@/lib/domain/convenio'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { TBody, TD, THead, TR } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/States'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Bar, Stat } from '@/components/portal/Stat'
import type { SettlementSummary } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const PERIODS = {
  todo: 'Todo',
  mes: 'Este mes',
  'mes-anterior': 'Mes anterior',
  anio: 'Este año',
} as const
type Period = keyof typeof PERIODS

const COLLECTION = { 'por-cobrar': 'Por cobrar', cobrados: 'Cobrados' } as const
type Collection = keyof typeof COLLECTION

/**
 * CONVENIOS — lo que se acordó con los patrones y lo que le toca a Solo Laboral.
 *
 * Los indicadores RESPETAN EL FILTRO, igual que en el histórico: si arriba
 * dijera el total de siempre mientras la tabla muestra "este mes", la pantalla
 * afirmaría dos cosas y ninguna se podría comprobar sumando los renglones.
 *
 * Los anulados nunca suman. Se pueden ver —con su motivo— activando el filtro,
 * porque un convenio que desaparece sin rastro es justo lo que no debe pasar.
 */
export default async function ConveniosPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()
  const params = flatten(searchParams)

  const period: Period = params.periodo && params.periodo in PERIODS ? (params.periodo as Period) : 'todo'
  const collection: Collection | undefined =
    params.cobro && params.cobro in COLLECTION ? (params.cobro as Collection) : undefined
  const includeVoided = params.anulados === '1'

  const filter: ListSettlementsOptions = {
    ...periodRange(period),
    lawyerId: params.abogado,
    query: params.q,
    collection: collection === 'por-cobrar' ? 'pending' : collection === 'cobrados' ? 'collected' : undefined,
  }

  const [rows, metrics, spread] = await Promise.all([
    listSettlements({ ...filter, includeVoided }),
    settlementMetrics(filter),
    // El reparto por abogado se cuenta SIN el filtro de abogado: filtrado,
    // mostraría una sola barra al 100 % y dejaría de servir para comparar.
    params.abogado ? settlementMetrics({ ...filter, lawyerId: undefined }) : null,
  ])
  const byLawyer = (spread ?? metrics).byLawyer
  const totalFee = (spread ?? metrics).feeCents

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/portal/convenios?${s}` : '/portal/convenios'
  }
  const filtered = Boolean(params.q || params.abogado || collection || period !== 'todo')

  return (
    <>
      <PageHeader
        title="Convenios"
        description="Lo acordado con los patrones y los honorarios de Solo Laboral."
        actions={
          <>
            <RefreshButton />
            <Link href="/portal/convenios/nuevo" className="sl-btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Registrar convenio</span>
              <span className="sm:hidden">Nuevo</span>
            </Link>
          </>
        }
      />

      {/* ───────────────────────────── periodo ──────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(PERIODS) as Period[]).map((key) => (
          <Chip key={key} href={link({ periodo: key === 'todo' ? undefined : key })} active={period === key}>
            {PERIODS[key]}
          </Chip>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-sl-border sm:block" aria-hidden />
        {(Object.keys(COLLECTION) as Collection[]).map((key) => (
          <Chip
            key={key}
            href={link({ cobro: collection === key ? undefined : key })}
            active={collection === key}
          >
            {COLLECTION[key]}
          </Chip>
        ))}
      </div>

      {/* ──────────────────────────── indicadores ───────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="sl-card col-span-2 overflow-hidden lg:col-span-1">
          <div className="h-full bg-sl-primary px-4 py-3.5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              Honorarios Solo Laboral
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoneyShort(metrics.feeCents)}</p>
            <p className="mt-0.5 text-xs text-white/70">
              {metrics.count} {metrics.count === 1 ? 'convenio' : 'convenios'}
            </p>
          </div>
        </div>
        <Stat
          label="Por cobrar"
          value={formatMoneyShort(metrics.feePendingCents)}
          tone={metrics.feePendingCents > 0 ? 'neutral' : 'muted'}
          hint={
            metrics.feeCents > 0
              ? `cobrado ${formatMoneyShort(metrics.feeCollectedCents)}`
              : 'sin honorarios en el periodo'
          }
        />
        <Stat
          label="Acordado con patrones"
          value={formatMoneyShort(metrics.agreedCents)}
          tone={metrics.agreedCents > 0 ? 'neutral' : 'muted'}
          hint={metrics.count > 0 ? `promedio ${formatMoneyShort(Math.round(metrics.agreedCents / metrics.count))}` : '—'}
        />
        <Stat
          label="Para los trabajadores"
          value={formatMoneyShort(metrics.clientNetCents)}
          tone={metrics.clientNetCents > 0 ? 'success' : 'muted'}
          hint="después de honorarios"
        />
      </div>

      {/* ─────────────────────────── por abogado ───────────────────────────── */}
      {byLawyer.length > 0 ? (
        <section className="sl-card mb-4 px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="sl-eyebrow">Honorarios por abogado</h2>
            {params.abogado ? (
              <Link href={link({ abogado: undefined })} className="text-xs text-sl-primary hover:underline">
                Quitar el filtro
              </Link>
            ) : (
              <span className="text-xs text-sl-muted">Toca un nombre para filtrar</span>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            {byLawyer.map((l) => (
              <Bar
                key={l.lawyerId}
                label={
                  <>
                    {l.lawyerName}{' '}
                    <span className="text-xs text-sl-muted">
                      · {l.count} {l.count === 1 ? 'convenio' : 'convenios'}
                    </span>
                  </>
                }
                valueLabel={formatMoneyShort(l.feeCents)}
                value={l.feeCents}
                total={totalFee}
                href={link({ abogado: params.abogado === l.lawyerId ? undefined : l.lawyerId })}
                active={params.abogado === l.lawyerId}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput label="Buscar por cliente o folio" placeholder="Buscar…" />
        <div className="flex items-center gap-3">
          <Link
            href={link({ anulados: includeVoided ? undefined : '1' })}
            className="text-xs text-sl-muted hover:text-sl-primary hover:underline"
          >
            {includeVoided ? 'Ocultar anulados' : 'Mostrar anulados'}
          </Link>
        </div>
      </div>

      <RefreshDim>
        {rows.length === 0 ? (
          <div className="sl-card">
            <EmptyState
              title={filtered ? 'Sin convenios con este filtro' : 'Todavía no hay convenios'}
              description={
                filtered
                  ? 'Prueba con otro periodo, abogado o búsqueda.'
                  : 'Cuando un caso termine en convenio con el patrón, regístralo aquí con el documento firmado: el portal calcula el 35 % de Solo Laboral.'
              }
              action={
                filtered ? (
                  <Link href="/portal/convenios" className="sl-btn-secondary">
                    Ver todos
                  </Link>
                ) : (
                  <Link href="/portal/convenios/nuevo" className="sl-btn-primary">
                    <Plus className="h-4 w-4" aria-hidden />
                    Registrar el primero
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            {/* ---------- TELÉFONO: tarjetas ---------- */}
            <ul className="space-y-3 lg:hidden">
              {rows.map((row, i) => (
                <li
                  key={row.id}
                  className={clsx('sl-card sl-in overflow-hidden', row.status === 'voided' && 'opacity-60')}
                  style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                >
                  <Link
                    href={`/portal/convenios/${row.id}`}
                    className="flex items-start gap-3 p-4 active:bg-sl-primary-soft/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-sl-primary">{row.folio}</span>
                        <EstadoBadge row={row} />
                        {row.isDemo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-sl-text">{row.clientName}</p>
                      <p className="mt-0.5 text-sm text-sl-muted">
                        {formatDate(row.signedOn)} · {row.lawyerName}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-sl-muted">Acordado</p>
                          <p className="text-sm tabular-nums text-sl-text">{formatMoney(row.agreedAmountCents)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-sl-muted">
                            Solo Laboral · {formatRate(row.feeRateBp)}
                          </p>
                          <p className="text-base font-semibold tabular-nums text-sl-primary">
                            {formatMoney(row.feeAmountCents)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-sl-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>

            {/* ---------- ESCRITORIO: tabla ---------- */}
            <div className="sl-card hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse">
                  <THead>
                    <TR>
                      <th scope="col" className="sl-th">Cliente</th>
                      <th scope="col" className="sl-th">Firma</th>
                      <th scope="col" className="sl-th">Abogado</th>
                      <th scope="col" className="sl-th text-right">Acordado</th>
                      <th scope="col" className="sl-th text-right">%</th>
                      <th scope="col" className="sl-th text-right">Solo Laboral</th>
                      <th scope="col" className="sl-th">Cobro</th>
                      <th scope="col" className="sl-th">Doc.</th>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row, i) => (
                      <TR
                        key={row.id}
                        className={clsx('sl-in', row.status === 'voided' && 'opacity-60')}
                        style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                      >
                        <TD className="font-medium">
                          <Link
                            href={`/portal/convenios/${row.id}`}
                            className="text-sl-text hover:text-sl-primary hover:underline"
                          >
                            {row.clientName}
                          </Link>
                          <span className="ml-2 font-mono text-xs font-semibold text-sl-primary">{row.folio}</span>
                          {row.isDemo ? <DemoBadge className="ml-2" /> : null}
                        </TD>
                        <TD className="whitespace-nowrap text-sl-muted">{formatDate(row.signedOn)}</TD>
                        <TD className="whitespace-nowrap">{row.lawyerName}</TD>
                        <TD className={clsx('whitespace-nowrap text-right tabular-nums', row.status === 'voided' && 'line-through')}>
                          {formatMoney(row.agreedAmountCents)}
                        </TD>
                        <TD className="whitespace-nowrap text-right tabular-nums text-sl-muted">
                          {formatRate(row.feeRateBp)}
                        </TD>
                        <TD
                          className={clsx(
                            'whitespace-nowrap text-right font-semibold tabular-nums text-sl-primary',
                            row.status === 'voided' && 'line-through',
                          )}
                        >
                          {formatMoney(row.feeAmountCents)}
                        </TD>
                        <TD>
                          <EstadoBadge row={row} />
                        </TD>
                        <TD>
                          {row.fileCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-sl-muted" title="Documentos">
                              <Paperclip className="h-3.5 w-3.5" aria-hidden />
                              {row.fileCount}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-sl-warning"
                              title="Falta el documento firmado"
                            >
                              <FileWarning className="h-3.5 w-3.5" aria-hidden />
                              Falta
                            </span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                  {rows.some((r) => r.status === 'active') ? (
                    <tfoot>
                      <tr className="border-t-2 border-sl-border bg-sl-background">
                        <td className="px-4 py-3 text-sm font-semibold text-sl-text" colSpan={3}>
                          Total ({metrics.count})
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                          {formatMoney(metrics.agreedCents)}
                        </td>
                        <td />
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-sl-primary">
                          {formatMoney(metrics.feeCents)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          </>
        )}
      </RefreshDim>
    </>
  )
}

function EstadoBadge({ row }: { row: SettlementSummary }) {
  if (row.status === 'voided') return <Badge tone="warning">Anulado</Badge>
  return row.feeCollectedAt ? <Badge tone="success">Cobrado</Badge> : <Badge tone="info">Por cobrar</Badge>
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={clsx(
        'whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-sl-primary text-white' : 'bg-sl-surface text-sl-text ring-1 ring-sl-border hover:bg-sl-primary-soft',
      )}
    >
      {children}
    </Link>
  )
}

/** Rango de fechas de firma para cada periodo, en la fecha civil del despacho. */
function periodRange(period: Period): { from?: string; to?: string } {
  const hoy = today()
  switch (period) {
    case 'mes':
      return { from: startOfMonth(hoy), to: hoy }
    case 'mes-anterior': {
      const inicio = addMonths(startOfMonth(hoy), -1)
      // Hasta el último día del mes anterior: el día antes del inicio de este.
      return { from: inicio, to: addDays(startOfMonth(hoy), -1) }
    }
    case 'anio':
      return { from: `${hoy.slice(0, 4)}-01-01`, to: hoy }
    default:
      return {}
  }
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
