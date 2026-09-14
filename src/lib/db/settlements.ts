/**
 * Repositorio de CONVENIOS.
 *
 * Un convenio SIEMPRE cuelga de un caso: el folio y el nombre del trabajador
 * vienen de ahí y no se recapturan. Lo que nace aquí es lo del acuerdo: fecha,
 * monto, porcentaje, el documento firmado y si Solo Laboral ya cobró.
 *
 * Los honorarios NO se escriben: los calcula la columna generada de la base.
 * Nada se borra: un convenio mal capturado se anula con su motivo, y un
 * documento subido queda para siempre (la tabla rechaza UPDATE y DELETE).
 */
import { createHash } from 'node:crypto'
import { db, iso, isoRequired, transaction, type Row } from '@/lib/db/sql'
import { isUuid } from '@/lib/db/leads'
import { recordAudit } from '@/lib/db/audit'
import type { PlainDate } from '@/lib/dates'
import type { SettlementFileType } from '@/lib/domain/convenio'
import { isAdminRole } from '@/lib/domain/types'
import type {
  CaseStatus,
  PublicStaffUser,
  Settlement,
  SettlementFile,
  SettlementSummary,
} from '@/lib/domain/types'

/** bigint y numeric vuelven del driver como texto. */
function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value)
}

function dateText(value: unknown): PlainDate {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function rowToSettlement(row: Row): Settlement {
  return {
    id: row.id,
    caseId: row.case_id,
    lawyerId: row.lawyer_id,
    signedOn: dateText(row.signed_on_text ?? row.signed_on),
    agreedAmountCents: num(row.agreed_amount_cents),
    feeRateBp: row.fee_rate_bp,
    feeAmountCents: num(row.fee_amount_cents),
    feeCollectedAt: iso(row.fee_collected_at),
    notes: row.notes,
    status: row.status,
    voidedAt: iso(row.voided_at),
    voidReason: row.void_reason,
    createdBy: row.created_by,
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  }
}

function rowToSummary(row: Row): SettlementSummary {
  return {
    ...rowToSettlement(row),
    folio: row.folio,
    clientName: row.client_name,
    lawyerName: row.lawyer_name,
    isDemo: row.is_demo,
    fileCount: num(row.file_count),
  }
}

/**
 * Quién puede corregir, anular o marcar cobrado un convenio: administración, el
 * abogado que lo llevó y quien lo capturó. Verlo lo ve todo el despacho, igual
 * que ve el caso.
 */
export function canManageSettlement(user: PublicStaffUser, settlement: Settlement): boolean {
  return (
    isAdminRole(user.role) || settlement.lawyerId === user.id || settlement.createdBy === user.id
  )
}

// ────────────────────────────────────────────────────────────────── consultas

const SUMMARY_SELECT = (sql: ReturnType<typeof db>) => sql`
  SELECT
    s.*,
    s.signed_on::text AS signed_on_text,
    c.folio          AS folio,
    l.full_name      AS client_name,
    l.is_demo        AS is_demo,
    u.name           AS lawyer_name,
    (SELECT count(*)::int FROM settlement_files f WHERE f.settlement_id = s.id) AS file_count
  FROM settlements s
  JOIN cases c       ON c.id = s.case_id
  JOIN leads l       ON l.id = c.lead_id
  JOIN staff_users u ON u.id = s.lawyer_id
`

export interface CaseOption {
  id: string
  folio: string
  clientName: string
  status: CaseStatus
  isDemo: boolean
}

/** Los casos a los que se les puede colgar un convenio: todos, recientes primero. */
export async function listCaseOptions(): Promise<CaseOption[]> {
  const rows = await db()`
    SELECT c.id, c.folio, c.status, l.full_name, l.is_demo
    FROM cases c JOIN leads l ON l.id = c.lead_id
    ORDER BY c.opened_at DESC
    LIMIT 1000
  `
  return rows.map((row) => ({
    id: row.id,
    folio: row.folio,
    clientName: row.full_name,
    status: row.status,
    isDemo: row.is_demo,
  }))
}

export interface ListSettlementsOptions {
  lawyerId?: string
  /** Fechas civiles de firma, inclusive. */
  from?: PlainDate
  to?: PlainDate
  query?: string
  collection?: 'pending' | 'collected'
  includeVoided?: boolean
}

/**
 * El filtro, en un solo sitio: lo usan la lista Y los indicadores. Si fueran
 * dos, la pantalla acabaría diciendo "$350,000 de honorarios" encima de una
 * tabla que suma otra cosa.
 */
function settlementFilter(sql: ReturnType<typeof db>, options: ListSettlementsOptions) {
  const needle = options.query?.trim() ?? ''
  const like = `%${needle}%`
  return sql`
    TRUE
    ${options.includeVoided ? sql`` : sql`AND s.status = 'active'`}
    ${options.lawyerId && isUuid(options.lawyerId) ? sql`AND s.lawyer_id = ${options.lawyerId}::uuid` : sql``}
    ${options.from ? sql`AND s.signed_on >= ${options.from}::date` : sql``}
    ${options.to ? sql`AND s.signed_on <= ${options.to}::date` : sql``}
    ${options.collection === 'pending' ? sql`AND s.fee_collected_at IS NULL` : sql``}
    ${options.collection === 'collected' ? sql`AND s.fee_collected_at IS NOT NULL` : sql``}
    ${needle ? sql`AND (l.full_name ILIKE ${like} OR c.folio ILIKE ${like})` : sql``}
  `
}

export async function listSettlements(
  options: ListSettlementsOptions = {},
): Promise<SettlementSummary[]> {
  const sql = db()
  const rows = await sql`
    ${SUMMARY_SELECT(sql)}
    WHERE ${settlementFilter(sql, options)}
    ORDER BY s.signed_on DESC, s.created_at DESC
    LIMIT 500
  `
  return rows.map(rowToSummary)
}

export interface SettlementMetrics {
  count: number
  agreedCents: number
  feeCents: number
  feeCollectedCents: number
  feePendingCents: number
  clientNetCents: number
  byLawyer: Array<{
    lawyerId: string
    lawyerName: string
    count: number
    agreedCents: number
    feeCents: number
  }>
}

/** Los anulados nunca suman, aunque la lista los esté mostrando. */
export async function settlementMetrics(
  options: ListSettlementsOptions = {},
): Promise<SettlementMetrics> {
  const sql = db()
  const where = settlementFilter(sql, { ...options, includeVoided: false })
  const [totals] = await sql`
    SELECT
      count(*)::int AS count,
      coalesce(sum(s.agreed_amount_cents), 0)::text AS agreed,
      coalesce(sum(s.fee_amount_cents), 0)::text AS fee,
      coalesce(sum(s.fee_amount_cents) FILTER (WHERE s.fee_collected_at IS NOT NULL), 0)::text AS collected
    FROM settlements s
    JOIN cases c ON c.id = s.case_id
    JOIN leads l ON l.id = c.lead_id
    WHERE ${where}
  `
  const lawyers = await sql`
    SELECT
      s.lawyer_id, u.name AS lawyer_name,
      count(*)::int AS count,
      sum(s.agreed_amount_cents)::text AS agreed,
      sum(s.fee_amount_cents)::text AS fee
    FROM settlements s
    JOIN cases c       ON c.id = s.case_id
    JOIN leads l       ON l.id = c.lead_id
    JOIN staff_users u ON u.id = s.lawyer_id
    WHERE ${where}
    GROUP BY s.lawyer_id, u.name
    ORDER BY sum(s.fee_amount_cents) DESC, u.name
  `
  const agreed = num(totals.agreed)
  const fee = num(totals.fee)
  const collected = num(totals.collected)
  return {
    count: totals.count,
    agreedCents: agreed,
    feeCents: fee,
    feeCollectedCents: collected,
    feePendingCents: fee - collected,
    clientNetCents: agreed - fee,
    byLawyer: lawyers.map((row) => ({
      lawyerId: row.lawyer_id,
      lawyerName: row.lawyer_name,
      count: row.count,
      agreedCents: num(row.agreed),
      feeCents: num(row.fee),
    })),
  }
}

export async function listSettlementsForCase(caseId: string): Promise<SettlementSummary[]> {
  if (!isUuid(caseId)) return []
  const sql = db()
  const rows = await sql`
    ${SUMMARY_SELECT(sql)}
    WHERE s.case_id = ${caseId}::uuid
    ORDER BY s.status, s.signed_on DESC, s.created_at DESC
  `
  return rows.map(rowToSummary)
}

export async function findSettlementById(id: string): Promise<SettlementSummary | null> {
  if (!isUuid(id)) return null
  const sql = db()
  const rows = await sql`${SUMMARY_SELECT(sql)} WHERE s.id = ${id}::uuid`
  return rows.length ? rowToSummary(rows[0]) : null
}

export async function listSettlementFiles(settlementId: string): Promise<SettlementFile[]> {
  if (!isUuid(settlementId)) return []
  const rows = await db()`
    SELECT f.id, f.settlement_id, f.file_name, f.mime_type, f.size_bytes, f.uploaded_at,
           u.name AS uploaded_by_name
    FROM settlement_files f
    LEFT JOIN staff_users u ON u.id = f.uploaded_by
    WHERE f.settlement_id = ${settlementId}::uuid
    ORDER BY f.uploaded_at
  `
  return rows.map((row) => ({
    id: row.id,
    settlementId: row.settlement_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: isoRequired(row.uploaded_at),
    uploadedByName: row.uploaded_by_name,
  }))
}

/** Los bytes de un documento, solo para la ruta que lo sirve. */
export async function getSettlementFileContent(
  fileId: string,
): Promise<{ fileName: string; mimeType: string; content: Buffer } | null> {
  if (!isUuid(fileId)) return null
  const rows = await db()`
    SELECT file_name, mime_type, content FROM settlement_files WHERE id = ${fileId}::uuid
  `
  if (!rows.length) return null
  return {
    fileName: rows[0].file_name,
    mimeType: rows[0].mime_type,
    content: Buffer.from(rows[0].content),
  }
}

// ──────────────────────────────────────────────────────────────── escritura

export interface UploadedFile {
  fileName: string
  mimeType: SettlementFileType
  bytes: Uint8Array
}

export interface SettlementInput {
  caseId: string
  lawyerId: string
  signedOn: PlainDate
  agreedAmountCents: number
  feeRateBp: number
  notes: string
}

export type CreateSettlementResult =
  | { ok: true; id: string }
  | { ok: false; code: 'case_not_found' | 'lawyer_not_found' }

async function insertFile(settlementId: string, file: UploadedFile, actorId: string) {
  const sha256 = createHash('sha256').update(file.bytes).digest('hex')
  const rows = await db()`
    INSERT INTO settlement_files
      (settlement_id, file_name, mime_type, size_bytes, sha256, content, uploaded_by)
    VALUES (
      ${settlementId}::uuid, ${file.fileName}, ${file.mimeType}, ${file.bytes.byteLength},
      ${sha256}, ${Buffer.from(file.bytes)}, ${actorId}::uuid
    )
    RETURNING id
  `
  await recordAudit({
    userId: actorId,
    action: 'settlement_file_add',
    entity: 'settlement',
    entityId: settlementId,
    after: { fileId: rows[0].id, fileName: file.fileName, sizeBytes: file.bytes.byteLength, sha256 },
  })
  return rows[0].id as string
}

/**
 * Registrar un convenio, con su documento si lo trae. Todo o nada: un convenio
 * guardado cuyo documento falló al subir obligaría a adivinar si se capturó.
 */
export async function createSettlement(
  input: SettlementInput,
  actorId: string,
  file?: UploadedFile | null,
): Promise<CreateSettlementResult> {
  if (!isUuid(input.caseId)) return { ok: false, code: 'case_not_found' }
  if (!isUuid(input.lawyerId)) return { ok: false, code: 'lawyer_not_found' }

  return transaction(async () => {
    const sql = db()
    const kase = await sql`SELECT 1 FROM cases WHERE id = ${input.caseId}::uuid`
    if (!kase.length) return { ok: false, code: 'case_not_found' } as const
    const lawyer = await sql`
      SELECT 1 FROM staff_users WHERE id = ${input.lawyerId}::uuid AND status = 'active'
    `
    if (!lawyer.length) return { ok: false, code: 'lawyer_not_found' } as const

    const rows = await sql`
      INSERT INTO settlements
        (case_id, lawyer_id, signed_on, agreed_amount_cents, fee_rate_bp, notes, created_by)
      VALUES (
        ${input.caseId}::uuid, ${input.lawyerId}::uuid, ${input.signedOn}::date,
        ${input.agreedAmountCents}, ${input.feeRateBp}, ${input.notes}, ${actorId}::uuid
      )
      RETURNING id, fee_amount_cents::text AS fee_amount_cents
    `
    const id = rows[0].id as string
    await recordAudit({
      userId: actorId,
      action: 'settlement_create',
      entity: 'settlement',
      entityId: id,
      after: {
        caseId: input.caseId,
        lawyerId: input.lawyerId,
        signedOn: input.signedOn,
        agreedAmountCents: input.agreedAmountCents,
        feeRateBp: input.feeRateBp,
        feeAmountCents: num(rows[0].fee_amount_cents),
      },
    })
    if (file) await insertFile(id, file, actorId)
    return { ok: true, id } as const
  })
}

export async function addSettlementFile(
  settlementId: string,
  file: UploadedFile,
  actorId: string,
): Promise<string | null> {
  if (!isUuid(settlementId)) return null
  return transaction(async () => {
    const exists = await db()`SELECT 1 FROM settlements WHERE id = ${settlementId}::uuid`
    if (!exists.length) return null
    return insertFile(settlementId, file, actorId)
  })
}

export async function updateSettlement(
  id: string,
  input: Omit<SettlementInput, 'caseId'>,
  actorId: string,
): Promise<boolean> {
  if (!isUuid(id) || !isUuid(input.lawyerId)) return false
  return transaction(async () => {
    const sql = db()
    const before = await sql`
      SELECT *, signed_on::text AS signed_on_text FROM settlements
      WHERE id = ${id}::uuid AND status = 'active' FOR UPDATE
    `
    if (!before.length) return false
    const previous = rowToSettlement(before[0])
    const rows = await sql`
      UPDATE settlements SET
        lawyer_id = ${input.lawyerId}::uuid,
        signed_on = ${input.signedOn}::date,
        agreed_amount_cents = ${input.agreedAmountCents},
        fee_rate_bp = ${input.feeRateBp},
        notes = ${input.notes}
      WHERE id = ${id}::uuid
      RETURNING fee_amount_cents::text AS fee_amount_cents
    `
    await recordAudit({
      userId: actorId,
      action: 'settlement_update',
      entity: 'settlement',
      entityId: id,
      before: {
        lawyerId: previous.lawyerId,
        signedOn: previous.signedOn,
        agreedAmountCents: previous.agreedAmountCents,
        feeRateBp: previous.feeRateBp,
        feeAmountCents: previous.feeAmountCents,
      },
      after: {
        lawyerId: input.lawyerId,
        signedOn: input.signedOn,
        agreedAmountCents: input.agreedAmountCents,
        feeRateBp: input.feeRateBp,
        feeAmountCents: num(rows[0].fee_amount_cents),
      },
    })
    return true
  })
}

export async function setFeeCollected(
  id: string,
  collected: boolean,
  actorId: string,
): Promise<boolean> {
  if (!isUuid(id)) return false
  return transaction(async () => {
    const rows = collected
      ? await db()`
          UPDATE settlements SET fee_collected_at = now(), fee_collected_by = ${actorId}::uuid
          WHERE id = ${id}::uuid AND status = 'active' AND fee_collected_at IS NULL
          RETURNING id
        `
      : await db()`
          UPDATE settlements SET fee_collected_at = NULL, fee_collected_by = NULL
          WHERE id = ${id}::uuid AND status = 'active' AND fee_collected_at IS NOT NULL
          RETURNING id
        `
    if (!rows.length) return false
    await recordAudit({
      userId: actorId,
      action: collected ? 'settlement_fee_collected' : 'settlement_fee_uncollected',
      entity: 'settlement',
      entityId: id,
    })
    return true
  })
}

export async function voidSettlement(id: string, reason: string, actorId: string): Promise<boolean> {
  if (!isUuid(id) || !reason.trim()) return false
  return transaction(async () => {
    const rows = await db()`
      UPDATE settlements
         SET status = 'voided', voided_at = now(), voided_by = ${actorId}::uuid,
             void_reason = ${reason.trim()}
       WHERE id = ${id}::uuid AND status = 'active'
       RETURNING id
    `
    if (!rows.length) return false
    await recordAudit({
      userId: actorId,
      action: 'settlement_void',
      entity: 'settlement',
      entityId: id,
      after: { reason: reason.trim() },
    })
    return true
  })
}
