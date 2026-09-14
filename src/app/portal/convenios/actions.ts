'use server'

/**
 * ACCIONES DE CONVENIOS.
 *
 * Todas comprueban la sesión EN EL SERVIDOR, y las que modifican un convenio
 * existente comprueban además que quien la pide lo pueda gestionar
 * (`canManageSettlement`): esconder el botón "Anular" a un colega no impide
 * mandar el POST a mano.
 *
 * El monto y el porcentaje llegan como texto y se interpretan aquí con las
 * mismas funciones que usa la vista previa del formulario. Los honorarios no
 * llegan nunca: los calcula la base.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentStaff } from '@/lib/auth/guard'
import {
  addSettlementFile,
  canManageSettlement,
  createSettlement,
  findSettlementById,
  setFeeCollected,
  updateSettlement,
  voidSettlement,
  type UploadedFile,
} from '@/lib/db/settlements'
import { isPlainDate, today } from '@/lib/dates'
import {
  MAX_FILE_BYTES,
  parseMoneyToCents,
  parseRateToBp,
  safeFileName,
  sniffFileType,
} from '@/lib/domain/convenio'

export interface ConvenioFormState {
  error?: string
  /** Solo al corregir: la ficha se queda donde está y cierra el formulario. */
  saved?: number
  fieldErrors?: Partial<Record<'caseId' | 'lawyerId' | 'signedOn' | 'amount' | 'rate' | 'file', string>>
}

export interface SimpleState {
  error?: string
  ok?: string
}

const SESSION_EXPIRED = 'Tu sesión expiró. Vuelve a entrar.'

function refresh(id?: string, caseId?: string) {
  revalidatePath('/portal/convenios')
  if (id) revalidatePath(`/portal/convenios/${id}`)
  if (caseId) revalidatePath(`/portal/seguimiento/${caseId}`)
}

/** Lee y valida los campos comunes a registrar y corregir. */
function readFields(formData: FormData) {
  const fieldErrors: NonNullable<ConvenioFormState['fieldErrors']> = {}

  const lawyerId = String(formData.get('lawyerId') ?? '')
  if (!lawyerId) fieldErrors.lawyerId = 'Elige al abogado que llevó el convenio.'

  const signedOn = String(formData.get('signedOn') ?? '')
  if (!isPlainDate(signedOn)) fieldErrors.signedOn = 'Indica la fecha en que se firmó.'
  else if (signedOn > today()) fieldErrors.signedOn = 'La fecha de firma no puede ser futura.'

  const agreedAmountCents = parseMoneyToCents(String(formData.get('amount') ?? ''))
  if (agreedAmountCents === null) {
    fieldErrors.amount = 'Escribe el monto acordado con el patrón, por ejemplo 150,000.00.'
  }

  const feeRateBp = parseRateToBp(String(formData.get('rate') ?? ''))
  if (feeRateBp === null) fieldErrors.rate = 'El porcentaje va de 0 a 100, por ejemplo 35.'

  const notes = String(formData.get('notes') ?? '').trim().slice(0, 2000)

  return { fieldErrors, lawyerId, signedOn, agreedAmountCents, feeRateBp, notes }
}

/**
 * El documento, validado por lo que ES y no por lo que dice ser.
 * Devuelve null si no se adjuntó nada, o un mensaje si no sirve.
 */
async function readFile(formData: FormData): Promise<UploadedFile | null | string> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return null
  if (file.size > MAX_FILE_BYTES) {
    return 'El archivo pesa más de 4 MB. Compártelo en PDF comprimido o como foto.'
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = sniffFileType(bytes)
  if (!mimeType) return 'Solo se aceptan PDF o fotos (JPG, PNG o WEBP).'
  return { fileName: safeFileName(file.name), mimeType, bytes }
}

// ───────────────────────────────────────────────────────────────── registrar

export async function createSettlementAction(
  _prev: ConvenioFormState,
  formData: FormData,
): Promise<ConvenioFormState> {
  const user = await currentStaff()
  if (!user) return { error: SESSION_EXPIRED }

  const fields = readFields(formData)
  const caseId = String(formData.get('caseId') ?? '')
  if (!caseId) fields.fieldErrors.caseId = 'Elige el caso al que pertenece el convenio.'

  const file = await readFile(formData)
  if (typeof file === 'string') fields.fieldErrors.file = file

  if (Object.keys(fields.fieldErrors).length > 0) {
    return { error: 'Revisa los campos marcados.', fieldErrors: fields.fieldErrors }
  }

  const result = await createSettlement(
    {
      caseId,
      lawyerId: fields.lawyerId,
      signedOn: fields.signedOn,
      agreedAmountCents: fields.agreedAmountCents as number,
      feeRateBp: fields.feeRateBp as number,
      notes: fields.notes,
    },
    user.id,
    file as UploadedFile | null,
  )

  if (!result.ok) {
    return result.code === 'case_not_found'
      ? { error: 'No encontramos ese caso.', fieldErrors: { caseId: 'Elige un caso de la lista.' } }
      : { error: 'Ese abogado no tiene una cuenta activa.', fieldErrors: { lawyerId: 'Elige otro.' } }
  }

  refresh(result.id, caseId)
  // Fuera de cualquier try: redirect() lanza una excepción de control de Next.
  redirect(`/portal/convenios/${result.id}?registrado=1`)
}

// ────────────────────────────────────────────────────────────────── corregir

export async function updateSettlementAction(
  _prev: ConvenioFormState,
  formData: FormData,
): Promise<ConvenioFormState> {
  const user = await currentStaff()
  if (!user) return { error: SESSION_EXPIRED }

  const id = String(formData.get('settlementId') ?? '')
  const settlement = await findSettlementById(id)
  if (!settlement) return { error: 'No encontramos ese convenio.' }
  if (!canManageSettlement(user, settlement)) {
    return { error: 'Solo administración o el abogado del convenio pueden corregirlo.' }
  }
  if (settlement.status === 'voided') return { error: 'Un convenio anulado ya no se corrige.' }

  const fields = readFields(formData)
  if (Object.keys(fields.fieldErrors).length > 0) {
    return { error: 'Revisa los campos marcados.', fieldErrors: fields.fieldErrors }
  }

  const ok = await updateSettlement(
    id,
    {
      lawyerId: fields.lawyerId,
      signedOn: fields.signedOn,
      agreedAmountCents: fields.agreedAmountCents as number,
      feeRateBp: fields.feeRateBp as number,
      notes: fields.notes,
    },
    user.id,
  )
  if (!ok) return { error: 'No se pudo guardar. Actualiza la página e inténtalo de nuevo.' }

  refresh(id, settlement.caseId)
  // Sin redirect: volver a la MISMA ficha por redirección deja el estado del
  // formulario en undefined en el cliente. Se revalida y el formulario se
  // cierra solo al ver `saved`.
  return { saved: Date.now() }
}

// ──────────────────────────────────────────────────────────────── documentos

export async function addFileAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await currentStaff()
  if (!user) return { error: SESSION_EXPIRED }

  const id = String(formData.get('settlementId') ?? '')
  const settlement = await findSettlementById(id)
  if (!settlement) return { error: 'No encontramos ese convenio.' }
  if (!canManageSettlement(user, settlement)) {
    return { error: 'Solo administración o el abogado del convenio pueden subir documentos.' }
  }

  const file = await readFile(formData)
  if (file === null) return { error: 'Elige el archivo que quieres subir.' }
  if (typeof file === 'string') return { error: file }

  const fileId = await addSettlementFile(id, file, user.id)
  if (!fileId) return { error: 'No se pudo subir el documento.' }

  refresh(id, settlement.caseId)
  return { ok: `Se subió «${file.fileName}».` }
}

// ────────────────────────────────────────────────────────────────────── cobro

export async function toggleCollectedAction(formData: FormData): Promise<void> {
  const user = await currentStaff()
  if (!user) redirect('/acceso')

  const id = String(formData.get('settlementId') ?? '')
  const settlement = await findSettlementById(id)
  if (!settlement || !canManageSettlement(user, settlement)) return

  await setFeeCollected(id, formData.get('collected') === '1', user.id)
  refresh(id, settlement.caseId)
}

// ───────────────────────────────────────────────────────────────────── anular

export async function voidSettlementAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await currentStaff()
  if (!user) return { error: SESSION_EXPIRED }

  const id = String(formData.get('settlementId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 1000)
  const settlement = await findSettlementById(id)
  if (!settlement) return { error: 'No encontramos ese convenio.' }
  if (!canManageSettlement(user, settlement)) {
    return { error: 'Solo administración o el abogado del convenio pueden anularlo.' }
  }
  if (!reason) return { error: 'Escribe por qué se anula: es lo que se leerá en la conciliación.' }

  const ok = await voidSettlement(id, reason, user.id)
  if (!ok) return { error: 'Este convenio ya estaba anulado.' }

  refresh(id, settlement.caseId)
  return { ok: 'Convenio anulado.' }
}
