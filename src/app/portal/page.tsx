import Link from 'next/link'
import { ChevronRight, MessageCircle, Phone } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { listQualifiedLeads } from '@/lib/db/leads'
import type { LeadSortKey } from '@/lib/db/leads'
import { formatDate, formatSubmittedAt, today } from '@/lib/dates'
import { formatPhone, telHref, whatsappHref } from '@/lib/domain/phone'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { SortHeader } from '@/components/ui/SortHeader'
import { SortSelect } from '@/components/portal/SortSelect'
import { RefreshButton, RefreshDim } from '@/components/portal/Refresh'
import { Pagination } from '@/components/ui/Pagination'
import { TBody, TD, THead, TR } from '@/components/ui/Table'
import { DemoNotice, EmptyState } from '@/components/ui/States'
import { CallTimeBadge, DaysBadge, DemoBadge } from '@/components/ui/Badge'

export const dynamic = 'force-dynamic'

const SORT_KEYS: LeadSortKey[] = ['caseNumber', 'submittedAt', 'fullName', 'dismissalDate']

/**
 * CASOS POR CONTACTAR.
 *
 * Solo aparecen los prospectos calificados, y el filtro no vive aquí sino en
 * `listQualifiedLeads`: esta pantalla no tiene forma de pedir los demás.
 * El abogado entra, ve a quién llamar y abre el caso. Nada más.
 *
 * DISEÑADA PARA EL TELÉFONO. La lista se consulta más desde el celular que
 * desde el escritorio, y el trabajo que sale de ella —marcar— se hace con el
 * mismo aparato. Por eso en móvil cada tarjeta trae el botón de llamar y el de
 * WhatsApp: antes el número estaba ahí, pero como texto plano, y había que
 * abrir el caso para poder marcarlo.
 */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireStaff()

  const params = flatten(searchParams)
  const sort = (
    SORT_KEYS.includes(params.sort as LeadSortKey) ? params.sort : 'submittedAt'
  ) as LeadSortKey
  const direction = params.dir === 'asc' ? 'asc' : 'desc'

  const result = await listQualifiedLeads({
    query: params.q,
    sort,
    direction,
    page: Number(params.page ?? '1') || 1,
    pageSize: 25,
  })

  const reference = today()
  const sortParams = { ...params, page: undefined }

  return (
    <>
      <PageHeader
        title="Casos por contactar"
        description="Solicitudes que cumplieron los criterios iniciales de Solo Laboral."
        actions={<RefreshButton />}
      />

      {result.rows.some((lead) => lead.isDemo) ? (
        <div className="mb-4">
          <DemoNotice>
            <span className="text-sl-muted">
              Algunos registros son de demostración de la Fase 1. Van rotulados DEMO y no se pueden
              contactar.
            </span>
          </DemoNotice>
        </div>
      ) : null}

      {/* Buscar y ordenar, uno junto a otro. En móvil el orden va debajo y a
          ancho completo, porque es un `select` que abre la rueda del sistema. */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput label="Buscar por nombre, folio o teléfono" placeholder="Buscar…" />
        <div className="sm:hidden">
          <SortSelect sort={sort} direction={direction} />
        </div>
      </div>

      <RefreshDim>
        {result.total === 0 ? (
          <div className="sl-card">
            <EmptyState
              title={params.q ? 'Sin resultados' : 'No hay casos por contactar'}
              description={
                params.q
                  ? 'Prueba con otro nombre, folio o número.'
                  : 'Aquí aparecerán las solicitudes que cumplan los dos criterios de revisión inicial.'
              }
            />
          </div>
        ) : (
          <>
            {/* ---------- TELÉFONO: tarjetas accionables ---------- */}
            <ul className="space-y-3 sm:hidden">
              {result.rows.map((lead, i) => (
                <li
                  key={lead.id}
                  className="sl-card sl-in overflow-hidden"
                  /* El escalonado se corta al octavo: más allá, la última tarjeta
                   entraría medio segundo tarde y eso ya no se lee como fluidez
                   sino como lentitud. */
                  style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                >
                  {/*
                  El bloque de datos es UN solo enlace al caso: objetivo táctil
                  grande y una única cosa que tocar. Las acciones van en su
                  propia barra, fuera del enlace — un `<a>` dentro de otro `<a>`
                  no es HTML válido y los lectores de pantalla se pierden.
                */}
                  <Link
                    href={`/portal/${lead.id}`}
                    className="flex items-start gap-3 p-4 active:bg-sl-primary-soft/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-sl-primary">
                          {lead.caseNumber}
                        </span>
                        {lead.isDemo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-sl-text">
                        {lead.fullName}
                      </p>
                      {lead.callPreference ? (
                        <p className="mt-1.5">
                          <CallTimeBadge preference={lead.callPreference} />
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-sm text-sl-muted">
                        Registrado {formatSubmittedAt(lead.submittedAt, reference)}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-sl-muted">
                        <span>Despido {formatDate(lead.dismissalDate)}</span>
                        <DaysBadge days={lead.dismissalDaysAtSubmission} />
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-sl-muted" aria-hidden />
                  </Link>

                  {lead.isDemo ? null : (
                    <div className="flex items-stretch gap-2 border-t border-sl-border bg-sl-primary-soft/30 p-3">
                      <a href={telHref(lead.phone)} className="sl-btn-primary flex-1">
                        <Phone className="h-4 w-4" aria-hidden />
                        <span className="tabular-nums">{formatPhone(lead.phone)}</span>
                      </a>
                      <a
                        href={whatsappHref(lead.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sl-btn-icon"
                        aria-label={`Escribir por WhatsApp a ${lead.fullName}`}
                      >
                        <MessageCircle className="h-5 w-5" aria-hidden />
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-1 sm:hidden">
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                basePath="/portal"
                params={params}
              />
            </div>

            {/* ---------- ESCRITORIO: tabla ---------- */}
            <div className="sl-card hidden overflow-hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse">
                  <THead>
                    <TR>
                      <SortHeader
                        label="Caso"
                        sortKey="fullName"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Folio"
                        sortKey="caseNumber"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Registrado"
                        sortKey="submittedAt"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal"
                        params={sortParams}
                      />
                      <SortHeader
                        label="Despido"
                        sortKey="dismissalDate"
                        currentSort={sort}
                        currentDirection={direction}
                        basePath="/portal"
                        params={sortParams}
                      />
                      <th scope="col" className="sl-th">
                        Contacto
                      </th>
                      <th scope="col" className="sl-th">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </TR>
                  </THead>
                  <TBody>
                    {result.rows.map((lead, i) => (
                      <TR
                        key={lead.id}
                        className="sl-in"
                        style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                      >
                        <TD className="font-medium">
                          <Link
                            href={`/portal/${lead.id}`}
                            className="text-sl-text hover:text-sl-primary hover:underline"
                          >
                            {lead.fullName}
                          </Link>
                          {lead.isDemo ? <DemoBadge className="ml-2" /> : null}
                          {lead.callPreference ? (
                            <span className="mt-1 block font-normal">
                              <CallTimeBadge preference={lead.callPreference} />
                            </span>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap font-mono text-xs font-semibold text-sl-primary">
                          {lead.caseNumber}
                        </TD>
                        <TD className="whitespace-nowrap text-sl-muted">
                          {formatSubmittedAt(lead.submittedAt, reference)}
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            {formatDate(lead.dismissalDate)}
                            <DaysBadge days={lead.dismissalDaysAtSubmission} compact />
                          </span>
                        </TD>
                        <TD className="whitespace-nowrap">
                          {lead.isDemo ? (
                            <span className="tabular-nums text-sl-muted">
                              {formatPhone(lead.phone)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <a
                                href={telHref(lead.phone)}
                                className="tabular-nums text-sl-text hover:text-sl-primary hover:underline"
                              >
                                {formatPhone(lead.phone)}
                              </a>
                              <a
                                href={whatsappHref(lead.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sl-muted hover:text-sl-success"
                                aria-label={`Escribir por WhatsApp a ${lead.fullName}`}
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden />
                              </a>
                            </span>
                          )}
                        </TD>
                        <TD align="right">
                          <Link
                            href={`/portal/${lead.id}`}
                            className="inline-flex items-center gap-1 font-medium text-sl-primary hover:underline"
                          >
                            Ver caso
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </Link>
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
                basePath="/portal"
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
