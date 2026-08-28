import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, MessageCircle, Phone, RotateCcw } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { findCaseById, listStatusHistory } from '@/lib/db/cases'
import { listChecklist, progressOf } from '@/lib/db/checklist'
import { listActiveUsers } from '@/lib/db/users'
import { assignCaseAction, reopenCaseAction, setCaseStatusAction } from '@/app/portal/seguimiento/actions'
import { formatDate, formatDateLong, formatDateTime } from '@/lib/dates'
import { formatPhone, telHref, whatsappHref } from '@/lib/domain/phone'
import { stateLabel } from '@/lib/domain/states'
import { formatCallTime } from '@/lib/domain/call-time'
import {
  CASE_CLOSE_REASON_LABEL,
  CASE_STATUS_LABEL,
  CASE_STATUS_TONE,
  LEAD_SOURCE_LABEL,
  OPEN_CASE_STATUSES,
} from '@/lib/domain/labels'
import { Badge, DaysBadge, DemoBadge } from '@/components/ui/Badge'
import { DemoNotice } from '@/components/ui/States'
import { CaseRoute } from '@/components/portal/CaseRoute'
import { CloseCase } from '@/components/portal/CloseCase'
import { Progress } from '@/components/portal/Progress'

export const dynamic = 'force-dynamic'

/**
 * DETALLE DEL CASO — la pantalla donde se trabaja un asunto.
 *
 * Todo lo de arriba responde "¿qué es esto y en qué va?": folio, cliente,
 * estado, progreso y el próximo paso. Debajo, la ruta completa.
 *
 * NADA se recaptura: el nombre, el teléfono, el estado, la fecha de despido y
 * lo que la persona contó vienen del lead. Si aquí hubiera un formulario para
 * volver a escribirlos, en un mes habría dos versiones del mismo dato y
 * ninguna sería la buena.
 */
export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  await requireStaff()

  const detail = await findCaseById(params.id)
  if (!detail) notFound()

  const { case: kase, lead, assignedUserName } = detail
  const [items, users, history] = await Promise.all([
    listChecklist(kase.id),
    listActiveUsers(),
    listStatusHistory(kase.id),
  ])
  const progress = progressOf(items)
  const closed = !OPEN_CASE_STATUSES.includes(kase.status)

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/portal/seguimiento"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-sl-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Seguimiento
      </Link>

      {lead.isDemo ? (
        <div className="mb-4">
          <DemoNotice>
            <span className="text-sl-muted">
              Caso de demostración. No corresponde a una persona real y no se puede contactar.
            </span>
          </DemoNotice>
        </div>
      ) : null}

      {/* ───────────────────────────── encabezado del caso ─────────────────── */}
      <div className="sl-card sl-in overflow-hidden">
        <div className="border-b border-sl-border bg-sl-primary-soft/50 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-sl-primary">{kase.folio}</span>
            <Badge tone={CASE_STATUS_TONE[kase.status]}>{CASE_STATUS_LABEL[kase.status]}</Badge>
            {lead.isDemo ? <DemoBadge /> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-sl-text">{lead.fullName}</h1>
          <p className="mt-1 text-sm text-sl-muted">
            En seguimiento desde el {formatDateTime(kase.openedAt)} · llegó por{' '}
            {LEAD_SOURCE_LABEL[lead.source].toLowerCase()}
          </p>

          <div className="mt-3 max-w-xs">
            <Progress {...progress} />
          </div>
          {kase.currentStage ? (
            <p className="mt-2 text-sm text-sl-text">
              <span className="sl-eyebrow">Etapa actual</span>{' '}
              <span className="font-medium">{kase.currentStage}</span>
            </p>
          ) : null}

          {lead.isDemo ? (
            <p className="mt-4 text-sm tabular-nums text-sl-muted">{formatPhone(lead.phone)}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a href={telHref(lead.phone)} className="sl-btn-primary sm:w-auto">
                <Phone className="h-4 w-4" aria-hidden />
                Llamar <span className="tabular-nums">{formatPhone(lead.phone)}</span>
              </a>
              <a
                href={whatsappHref(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="sl-btn-secondary sm:w-auto"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          )}
        </div>

        {/* Cierre: se explica antes que nada, porque cambia cómo se lee todo
            lo demás de la pantalla. */}
        {closed ? (
          <div className="border-b border-sl-border bg-sl-background px-5 py-4 sm:px-7">
            <p className="text-sm text-sl-text">
              Seguimiento finalizado el {formatDateTime(kase.closedAt)}
              {kase.closedReason ? (
                <>
                  {' '}
                  · <strong className="font-semibold">{CASE_CLOSE_REASON_LABEL[kase.closedReason]}</strong>
                </>
              ) : null}
            </p>
            {kase.closedNote ? (
              <p className="mt-1 whitespace-pre-line text-sm text-sl-muted">{kase.closedNote}</p>
            ) : null}
            <form action={reopenCaseAction} className="mt-3">
              <input type="hidden" name="caseId" value={kase.id} />
              <button type="submit" className="sl-btn-secondary">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reabrir caso
              </button>
            </form>
          </div>
        ) : (
          /* Responsable y estado se cambian aquí mismo, sin salir del caso:
             son las dos cosas que se ajustan a media llamada. */
          <div className="flex flex-col gap-3 border-b border-sl-border px-5 py-4 sm:flex-row sm:items-end sm:px-7">
            <form action={assignCaseAction} className="flex items-end gap-2">
              <input type="hidden" name="caseId" value={kase.id} />
              <div>
                <label htmlFor="assignedUserId" className="sl-label">Responsable</label>
                <select
                  id="assignedUserId"
                  name="assignedUserId"
                  defaultValue={kase.assignedUserId ?? ''}
                  className="sl-input w-auto"
                >
                  <option value="">Sin asignar</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="sl-btn-secondary">Guardar</button>
            </form>

            <form action={setCaseStatusAction} className="flex items-end gap-2">
              <input type="hidden" name="caseId" value={kase.id} />
              <div>
                <label htmlFor="status" className="sl-label">Estado</label>
                <select id="status" name="status" defaultValue={kase.status} className="sl-input w-auto">
                  {OPEN_CASE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {CASE_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="sl-btn-secondary">Guardar</button>
            </form>

            <div className="sm:ml-auto">
              <CloseCase caseId={kase.id} />
            </div>
          </div>
        )}

        {/* ─────────────────────── lo que heredó del lead ──────────────────── */}
        <div className="border-b border-sl-border px-5 py-5 sm:px-7">
          <h2 className="sl-eyebrow">Qué nos contó</h2>
          {lead.description ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-sl-text">
              {lead.description}
            </p>
          ) : (
            <p className="mt-2 rounded-sl border border-dashed border-sl-border bg-sl-background px-4 py-3 text-sm text-sl-muted">
              No escribió una descripción; el campo es opcional en el formulario.
            </p>
          )}
        </div>

        {lead.callPreference ? (
          <div className="flex items-start gap-2.5 border-b border-sl-border bg-sl-secondary/5 px-5 py-4 sm:px-7">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-sl-secondary-strong" aria-hidden />
            <p className="text-sm text-sl-text">
              Pidió que le llamaran el{' '}
              <strong className="font-semibold">{formatDateLong(lead.callPreference.date)}</strong> a
              las <strong className="font-semibold">{formatCallTime(lead.callPreference.time)}</strong>.
            </p>
          </div>
        ) : null}

        <dl className="divide-y divide-sl-border">
          <Row label="Estado">{stateLabel(lead.state)}</Row>
          <Row label="Fecha de despido">{formatDate(lead.dismissalDate)}</Row>
          <Row label="Días al registrarse">
            <DaysBadge days={lead.dismissalDaysAtSubmission} />
          </Row>
          <Row label="Responsable">{assignedUserName ?? 'Sin asignar'}</Row>
          <Row label="Lead original">
            <Link href={`/portal/${lead.id}`} className="text-sl-primary hover:underline">
              Ver la ficha del lead
            </Link>
          </Row>
        </dl>
      </div>

      {/* ─────────────────────────────── ruta del caso ───────────────────── */}
      <div className="mt-5">
        <CaseRoute caseId={kase.id} items={items} users={users} readOnly={closed} />
      </div>

      {/* ───────────────────────────── historia de estados ────────────────── */}
      {history.length > 0 ? (
        <section className="sl-card mt-5 overflow-hidden">
          <div className="border-b border-sl-border px-5 py-3.5">
            <h2 className="sl-eyebrow">Historia del caso</h2>
          </div>
          <ol className="divide-y divide-sl-border">
            {history.map((change) => (
              <li key={change.id} className="px-5 py-3 text-sm">
                <p className="text-sl-text">
                  {change.previousStatus ? (
                    <>
                      {CASE_STATUS_LABEL[change.previousStatus]} →{' '}
                      <strong className="font-semibold">
                        {CASE_STATUS_LABEL[change.newStatus]}
                      </strong>
                    </>
                  ) : (
                    <>
                      Caso abierto como{' '}
                      <strong className="font-semibold">
                        {CASE_STATUS_LABEL[change.newStatus]}
                      </strong>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-sl-muted">
                  {formatDateTime(change.changedAt)}
                  {change.changedByName ? ` · ${change.changedByName}` : ''}
                  {change.reason ? ` · ${change.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5 sm:flex sm:gap-6 sm:px-7">
      <dt className="sl-eyebrow sm:w-52 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="mt-1 text-sm text-sl-text sm:mt-0">{children}</dd>
    </div>
  )
}
