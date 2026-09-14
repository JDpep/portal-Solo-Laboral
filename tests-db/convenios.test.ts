import { beforeEach, describe, expect, it } from 'vitest'
import { crearAbogado, resetDb } from './helpers'
import { db } from '@/lib/db/sql'
import { createLead } from '@/lib/db/leads'
import { convertLeadToCase } from '@/lib/db/cases'
import {
  addSettlementFile,
  canManageSettlement,
  createSettlement,
  findSettlementById,
  getSettlementFileContent,
  listSettlementFiles,
  listSettlements,
  listSettlementsForCase,
  setFeeCollected,
  settlementMetrics,
  updateSettlement,
  voidSettlement,
} from '@/lib/db/settlements'
import { listAuditForEntity } from '@/lib/db/audit'
import { feeCents } from '@/lib/domain/convenio'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, today } from '@/lib/dates'

/**
 * CONVENIOS.
 *
 * Lo que importa probar contra la base de verdad: que los honorarios los
 * calcula ella y coinciden al centavo con la vista previa, que nada se borra y
 * que los indicadores cuentan exactamente lo que lista la tabla.
 */
let contador = 0

async function crearCaso(nombre: string) {
  contador += 1
  const hoy = today()
  const dismissalDate = addDays(hoy, -20)
  const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })
  const lead = await createLead({
    fullName: nombre,
    phone: `55987654${String(contador).padStart(2, '0')}`,
    state: 'CMX',
    dismissalDate,
    description: '',
    submittedOn: hoy,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })
  const abogada = await crearAbogado(`Abogada ${contador}`)
  const result = await convertLeadToCase(lead.id, abogada.id)
  if (!result.ok) throw new Error(result.code)
  return { caseId: result.caseId, abogada }
}

const PDF = new TextEncoder().encode('%PDF-1.7\nconvenio firmado\n%%EOF')

beforeEach(async () => {
  await resetDb()
})

describe('convenios', () => {
  it('la base calcula el 35 % sobre lo acordado, igual que la vista previa', async () => {
    const { caseId, abogada } = await crearCaso('Juan Pérez')
    const montos = [10_000_000, 12_345_678, 1, 10, 99_999_999_99, 15_000_050]
    for (const monto of montos) {
      const r = await createSettlement(
        { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: monto, feeRateBp: 3500, notes: '' },
        abogada.id,
      )
      if (!r.ok) throw new Error(r.code)
      const s = await findSettlementById(r.id)
      expect(s?.feeAmountCents).toBe(feeCents(monto, 3500))
    }
  })

  it('registra el convenio con su documento en una sola operación', async () => {
    const { caseId, abogada } = await crearCaso('María López')
    const r = await createSettlement(
      { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: 20_000_000, feeRateBp: 3500, notes: 'CFCRL' },
      abogada.id,
      { fileName: 'convenio.pdf', mimeType: 'application/pdf', bytes: PDF },
    )
    if (!r.ok) throw new Error(r.code)

    const s = await findSettlementById(r.id)
    expect(s).toMatchObject({
      folio: 'SL-000001',
      clientName: 'María López',
      lawyerName: abogada.name,
      agreedAmountCents: 20_000_000,
      feeAmountCents: 7_000_000,
      fileCount: 1,
    })
    const files = await listSettlementFiles(r.id)
    expect(files[0]).toMatchObject({ fileName: 'convenio.pdf', sizeBytes: PDF.byteLength })
    const content = await getSettlementFileContent(files[0].id)
    expect(new Uint8Array(content!.content)).toEqual(PDF)
    expect(await listSettlementsForCase(caseId)).toHaveLength(1)
  })

  it('no acepta un caso inexistente ni un abogado dado de baja', async () => {
    const { caseId, abogada } = await crearCaso('Pedro')
    const base = { signedOn: today(), agreedAmountCents: 100, feeRateBp: 3500, notes: '' }
    expect(
      await createSettlement({ ...base, caseId: '00000000-0000-4000-8000-000000000000', lawyerId: abogada.id }, abogada.id),
    ).toEqual({ ok: false, code: 'case_not_found' })
    await db()`UPDATE staff_users SET status = 'inactive' WHERE id = ${abogada.id}::uuid`
    expect(await createSettlement({ ...base, caseId, lawyerId: abogada.id }, abogada.id)).toEqual({
      ok: false,
      code: 'lawyer_not_found',
    })
  })

  it('el documento firmado no se reescribe ni se borra', async () => {
    const { caseId, abogada } = await crearCaso('Ana')
    const r = await createSettlement(
      { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: 100_00, feeRateBp: 3500, notes: '' },
      abogada.id,
    )
    if (!r.ok) throw new Error(r.code)
    const fileId = await addSettlementFile(r.id, { fileName: 'a.pdf', mimeType: 'application/pdf', bytes: PDF }, abogada.id)
    await expect(db()`DELETE FROM settlement_files WHERE id = ${fileId}::uuid`).rejects.toThrow(/solo inserción/)
    await expect(
      db()`UPDATE settlement_files SET file_name = 'otro.pdf' WHERE id = ${fileId}::uuid`,
    ).rejects.toThrow(/solo inserción/)
  })

  it('corregir recalcula los honorarios y deja rastro de antes y después', async () => {
    const { caseId, abogada } = await crearCaso('Luis')
    const r = await createSettlement(
      { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: 10_000_000, feeRateBp: 3500, notes: '' },
      abogada.id,
    )
    if (!r.ok) throw new Error(r.code)
    expect(
      await updateSettlement(
        r.id,
        { lawyerId: abogada.id, signedOn: today(), agreedAmountCents: 12_000_000, feeRateBp: 3000, notes: 'corregido' },
        abogada.id,
      ),
    ).toBe(true)
    expect((await findSettlementById(r.id))?.feeAmountCents).toBe(3_600_000)
    const audit = await listAuditForEntity('settlement', r.id)
    const update = audit.find((a) => a.action === 'settlement_update')
    expect(update?.before).toMatchObject({ feeAmountCents: 3_500_000 })
    expect(update?.after).toMatchObject({ feeAmountCents: 3_600_000 })
  })

  it('anular exige motivo, no borra, y el anulado deja de sumar', async () => {
    const { caseId, abogada } = await crearCaso('Rosa')
    const crear = async (monto: number) => {
      const r = await createSettlement(
        { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: monto, feeRateBp: 3500, notes: '' },
        abogada.id,
      )
      if (!r.ok) throw new Error(r.code)
      return r.id
    }
    const bueno = await crear(10_000_000)
    const malo = await crear(99_900_000)

    expect(await voidSettlement(malo, '   ', abogada.id)).toBe(false)
    expect(await voidSettlement(malo, 'Capturado dos veces', abogada.id)).toBe(true)
    expect(await voidSettlement(malo, 'otra vez', abogada.id)).toBe(false)

    const metrics = await settlementMetrics({})
    expect(metrics).toMatchObject({ count: 1, agreedCents: 10_000_000, feeCents: 3_500_000 })
    expect((await listSettlements({})).map((s) => s.id)).toEqual([bueno])
    expect(await listSettlements({ includeVoided: true })).toHaveLength(2)
    // Un anulado no se puede corregir ni cobrar.
    expect(await setFeeCollected(malo, true, abogada.id)).toBe(false)
  })

  it('cobrado / por cobrar, y el reparto por abogado', async () => {
    const uno = await crearCaso('Caso uno')
    const dos = await crearCaso('Caso dos')
    const a = await createSettlement(
      { caseId: uno.caseId, lawyerId: uno.abogada.id, signedOn: today(), agreedAmountCents: 10_000_000, feeRateBp: 3500, notes: '' },
      uno.abogada.id,
    )
    const b = await createSettlement(
      { caseId: dos.caseId, lawyerId: dos.abogada.id, signedOn: addDays(today(), -40), agreedAmountCents: 30_000_000, feeRateBp: 3500, notes: '' },
      dos.abogada.id,
    )
    if (!a.ok || !b.ok) throw new Error('alta')

    expect(await setFeeCollected(a.id, true, uno.abogada.id)).toBe(true)
    expect(await setFeeCollected(a.id, true, uno.abogada.id)).toBe(false)

    const all = await settlementMetrics({})
    expect(all).toMatchObject({
      count: 2,
      agreedCents: 40_000_000,
      feeCents: 14_000_000,
      feeCollectedCents: 3_500_000,
      feePendingCents: 10_500_000,
      clientNetCents: 26_000_000,
    })
    expect(all.byLawyer.map((l) => l.feeCents)).toEqual([10_500_000, 3_500_000])

    // Los indicadores respetan el mismo filtro que la lista.
    const recientes = { from: addDays(today(), -10) }
    expect((await listSettlements(recientes)).length).toBe((await settlementMetrics(recientes)).count)
    expect(await settlementMetrics({ collection: 'pending' })).toMatchObject({ count: 1, feeCents: 10_500_000 })
    expect(await listSettlements({ lawyerId: uno.abogada.id })).toHaveLength(1)
    expect(await listSettlements({ query: 'dos' })).toHaveLength(1)
  })

  it('solo administración, el abogado del convenio o quien lo capturó lo gestionan', async () => {
    const { caseId, abogada } = await crearCaso('Permisos')
    const otra = await crearAbogado('Otra abogada')
    const r = await createSettlement(
      { caseId, lawyerId: abogada.id, signedOn: today(), agreedAmountCents: 100, feeRateBp: 3500, notes: '' },
      abogada.id,
    )
    if (!r.ok) throw new Error(r.code)
    const s = (await findSettlementById(r.id))!
    expect(canManageSettlement(abogada, s)).toBe(true)
    expect(canManageSettlement(otra, s)).toBe(false)
    expect(canManageSettlement({ ...otra, role: 'admin' }, s)).toBe(true)
  })

  it('los montos imposibles los rechaza la base aunque la aplicación fallara', async () => {
    const { caseId, abogada } = await crearCaso('Checks')
    await expect(
      db()`INSERT INTO settlements (case_id, lawyer_id, signed_on, agreed_amount_cents)
           VALUES (${caseId}::uuid, ${abogada.id}::uuid, now()::date, 0)`,
    ).rejects.toThrow()
    await expect(
      db()`INSERT INTO settlements (case_id, lawyer_id, signed_on, agreed_amount_cents, fee_rate_bp)
           VALUES (${caseId}::uuid, ${abogada.id}::uuid, now()::date, 100, 10001)`,
    ).rejects.toThrow()
  })
})
