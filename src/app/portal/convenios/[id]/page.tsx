import Link from 'next/link'
import { notFound } from 'next/navigation'
import clsx from 'clsx'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileText,
  FileWarning,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { canManageSettlement, findSettlementById, listSettlementFiles } from '@/lib/db/settlements'
import { listActiveUsers } from '@/lib/db/users'
import { listAuditForEntity } from '@/lib/db/audit'
import { toggleCollectedAction } from '@/app/portal/convenios/actions'
import { formatDate, formatDateTime, today } from '@/lib/dates'
import {
  breakdown,
  formatMoney,
  formatRate,
  moneyInputValue,
  rateInputValue,
} from '@/lib/domain/convenio'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Dato, Ficha, SinDato } from '@/components/portal/FichaTecnica'
import { AnularConvenio, CorregirConvenio, SubirDocumento } from '@/components/portal/ConvenioAcciones'
import type { AuditAction } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const AUDIT_LABEL: Partial<Record<AuditAction, string>> = {
  settlement_create: 'Registró el convenio',
  settlement_update: 'Corrigió los datos',
  settlement_void: 'Anuló el convenio',
  settlement_file_add: 'Subió un documento',
  settlement_fee_collected: 'Marcó los honorarios como cobrados',
  settlement_fee_uncollected: 'Regresó los honorarios a por cobrar',
}

/**
 * FICHA DEL CONVENIO.
 *
 * Arriba la cuenta —lo acordado, lo de Solo Laboral, lo del trabajador—, que es
 * a lo que se viene. Después los documentos, que son el respaldo de esa cuenta,
 * y al final la bitácora: quién lo capturó, quién lo corrigió y cuándo se cobró.
 */
export default async function ConvenioPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { registrado?: string }
}) {
  const user = await requireStaff()
  const settlement = await findSettlementById(params.id)
  if (!settlement) notFound()

  const [files, audit, users] = await Promise.all([
    listSettlementFiles(settlement.id),
    listAuditForEntity('settlement', settlement.id),
    listActiveUsers(),
  ])
  const canManage = canManageSettlement(user, settlement)
  const voided = settlement.status === 'voided'
  const numbers = breakdown(settlement.agreedAmountCents, settlement.feeRateBp)
  const feeShare = numbers.agreedCents > 0 ? (numbers.feeCents / numbers.agreedCents) * 100 : 0
  const lawyers = users.some((u) => u.id === settlement.lawyerId)
    ? users
    : [...users, { id: settlement.lawyerId, name: settlement.lawyerName }]

  const notice = searchParams.registrado ? 'Convenio registrado.' : null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/portal/convenios" className="inline-flex items-center gap-1.5 text-sm text-sl-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Convenios
        </Link>
        <Link
          href={`/portal/seguimiento/${settlement.caseId}`}
          className="text-sm text-sl-primary hover:underline"
        >
          Ver el caso {settlement.folio}
        </Link>
      </div>

      {notice ? (
        <p
          className="sl-in mb-4 flex items-center gap-2 rounded-sl border border-sl-success/30 bg-sl-success/5 px-3.5 py-2.5 text-sm text-sl-success"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {notice}
        </p>
      ) : null}

      {/* ───────────────────────────── encabezado ──────────────────────────── */}
      <div className="sl-card sl-in overflow-hidden">
        <div className="border-b border-sl-border bg-sl-primary-soft/50 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-sl-primary">{settlement.folio}</span>
            {voided ? (
              <Badge tone="warning">Anulado</Badge>
            ) : settlement.feeCollectedAt ? (
              <Badge tone="success">Honorarios cobrados</Badge>
            ) : (
              <Badge tone="info">Honorarios por cobrar</Badge>
            )}
            {settlement.isDemo ? <DemoBadge /> : null}
            {files.length === 0 ? (
              <Badge tone="warning" className="gap-1">
                <FileWarning className="h-3 w-3" aria-hidden />
                Falta el documento
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-sl-text">Convenio · {settlement.clientName}</h1>
          <p className="mt-1 text-sm text-sl-muted">
            Firmado el {formatDate(settlement.signedOn)} · llevado por {settlement.lawyerName}
          </p>
        </div>

        {voided ? (
          <div className="border-b border-sl-border bg-sl-warning/5 px-5 py-4 sm:px-7">
            <p className="text-sm text-sl-text">
              Anulado el {formatDateTime(settlement.voidedAt)}. No suma en los indicadores.
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-sl-muted">{settlement.voidReason}</p>
          </div>
        ) : null}

        {/* ─────────────────────────────── la cuenta ─────────────────────────── */}
        <div className={clsx('px-5 py-6 sm:px-7', voided && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra label="Acordado con el patrón" value={formatMoney(numbers.agreedCents)} />
            <Cifra
              label={`Solo Laboral · ${formatRate(numbers.rateBp)}`}
              value={formatMoney(numbers.feeCents)}
              highlight
              strike={voided}
            />
            <Cifra label="Le queda al trabajador" value={formatMoney(numbers.clientNetCents)} />
          </div>
          <div
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-sl-primary-soft"
            role="img"
            aria-label={`${formatRate(numbers.rateBp)} para Solo Laboral, el resto para el trabajador`}
          >
            <span className="block h-full bg-sl-secondary" style={{ width: `${feeShare}%` }} />
            <span className="block h-full bg-sl-accent" style={{ width: `${100 - feeShare}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-sl-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sl-secondary" aria-hidden />
              Solo Laboral
            </span>
            <span className="flex items-center gap-1.5">
              Trabajador
              <span className="h-2 w-2 rounded-full bg-sl-accent" aria-hidden />
            </span>
          </div>
        </div>

        {/* ─────────────────────────────── acciones ──────────────────────────── */}
        {canManage && !voided ? (
          <div className="flex flex-wrap items-start gap-2 border-t border-sl-border px-5 py-4 sm:px-7">
            <form action={toggleCollectedAction}>
              <input type="hidden" name="settlementId" value={settlement.id} />
              <input type="hidden" name="collected" value={settlement.feeCollectedAt ? '0' : '1'} />
              {settlement.feeCollectedAt ? (
                <button type="submit" className="sl-btn-secondary">
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Regresar a por cobrar
                </button>
              ) : (
                <button type="submit" className="sl-btn-primary">
                  <CircleDollarSign className="h-4 w-4" aria-hidden />
                  Marcar honorarios cobrados
                </button>
              )}
            </form>
            <CorregirConvenio
              settlementId={settlement.id}
              lawyers={lawyers.map((u) => ({ id: u.id, name: u.name }))}
              today={today()}
              defaults={{
                lawyerId: settlement.lawyerId,
                signedOn: settlement.signedOn,
                amount: moneyInputValue(settlement.agreedAmountCents),
                rate: rateInputValue(settlement.feeRateBp),
                notes: settlement.notes,
              }}
            />
            <div className="sm:ml-auto">
              <AnularConvenio settlementId={settlement.id} />
            </div>
          </div>
        ) : null}

        <Ficha>
          <Dato label="Folio del caso" mono>
            {settlement.folio}
          </Dato>
          <Dato label="Cliente">{settlement.clientName}</Dato>
          <Dato label="Fecha de firma">{formatDate(settlement.signedOn)}</Dato>
          <Dato label="Abogado">{settlement.lawyerName}</Dato>
          <Dato label="Porcentaje">{formatRate(settlement.feeRateBp)}</Dato>
          <Dato label="Cobro">
            {settlement.feeCollectedAt ? (
              formatDateTime(settlement.feeCollectedAt)
            ) : (
              <SinDato>Por cobrar</SinDato>
            )}
          </Dato>
          <Dato label="Registrado">{formatDateTime(settlement.createdAt)}</Dato>
          <Dato label="Documentos">{files.length || <SinDato>Ninguno</SinDato>}</Dato>
        </Ficha>

        {settlement.notes ? (
          <div className="border-t border-sl-border px-5 py-5 sm:px-7">
            <h2 className="sl-eyebrow">Notas</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-sl-text">{settlement.notes}</p>
          </div>
        ) : null}
      </div>

      {/* ─────────────────────────────── documentos ────────────────────────── */}
      <section className="sl-card mt-5 overflow-hidden">
        <div className="border-b border-sl-border px-5 py-3.5">
          <h2 className="sl-eyebrow">Documentos</h2>
        </div>
        {files.length > 0 ? (
          <ul className="divide-y divide-sl-border">
            {files.map((file) => {
              const Icon = file.mimeType === 'application/pdf' ? FileText : ImageIcon
              return (
                <li key={file.id}>
                  <a
                    href={`/portal/convenios/documento/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-sl-background"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sl bg-sl-primary-soft text-sl-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sl-text">{file.fileName}</span>
                      <span className="block text-xs text-sl-muted">
                        {(file.sizeBytes / 1_000_000).toFixed(1)} MB · {formatDateTime(file.uploadedAt)}
                        {file.uploadedByName ? ` · ${file.uploadedByName}` : ''}
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
                  </a>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-sl-muted">
            Todavía no se ha subido el convenio firmado.
          </p>
        )}
        {canManage ? (
          <div className="border-t border-sl-border bg-sl-background/60 px-5 py-4">
            <SubirDocumento settlementId={settlement.id} />
          </div>
        ) : null}
      </section>

      {/* ─────────────────────────────── bitácora ──────────────────────────── */}
      {audit.length > 0 ? (
        <section className="sl-card mt-5 overflow-hidden">
          <div className="border-b border-sl-border px-5 py-3.5">
            <h2 className="sl-eyebrow">Bitácora</h2>
          </div>
          <ol className="divide-y divide-sl-border">
            {audit.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <p className="text-sl-text">{AUDIT_LABEL[entry.action] ?? entry.action}</p>
                <p className="mt-0.5 text-xs text-sl-muted">
                  {formatDateTime(entry.createdAt)}
                  {entry.userName ? ` · ${entry.userName}` : ''}
                  {auditDetail(entry.action, entry.before, entry.after)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function Cifra({
  label,
  value,
  highlight,
  strike,
}: {
  label: string
  value: string
  highlight?: boolean
  strike?: boolean
}) {
  return (
    <div className={clsx('rounded-sl px-4 py-3', highlight ? 'bg-sl-primary text-white' : 'bg-sl-background')}>
      <p className={clsx('text-[11px] font-semibold uppercase tracking-wider', highlight ? 'text-white/70' : 'text-sl-muted')}>
        {label}
      </p>
      <p className={clsx('mt-1 text-2xl font-semibold tabular-nums', strike && 'line-through')}>{value}</p>
    </div>
  )
}

/** Lo que cambió, en una línea, para las correcciones. */
function auditDetail(action: AuditAction, before: unknown, after: unknown): string {
  if (action === 'settlement_file_add') {
    const name = (after as { fileName?: string } | null)?.fileName
    return name ? ` · ${name}` : ''
  }
  if (action === 'settlement_void') {
    const reason = (after as { reason?: string } | null)?.reason
    return reason ? ` · ${reason}` : ''
  }
  if (action !== 'settlement_update') return ''
  const b = before as { agreedAmountCents?: number; feeRateBp?: number } | null
  const a = after as { agreedAmountCents?: number; feeRateBp?: number } | null
  if (!a || !b) return ''
  const parts: string[] = []
  if (a.agreedAmountCents !== b.agreedAmountCents && a.agreedAmountCents && b.agreedAmountCents) {
    parts.push(`monto ${formatMoney(b.agreedAmountCents)} → ${formatMoney(a.agreedAmountCents)}`)
  }
  if (a.feeRateBp !== b.feeRateBp && a.feeRateBp !== undefined && b.feeRateBp !== undefined) {
    parts.push(`porcentaje ${formatRate(b.feeRateBp)} → ${formatRate(a.feeRateBp)}`)
  }
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}
