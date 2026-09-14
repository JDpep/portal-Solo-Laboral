'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import clsx from 'clsx'
import { FileUp, Paperclip, Percent, Search, X } from 'lucide-react'
import {
  createSettlementAction,
  updateSettlementAction,
  type ConvenioFormState,
} from '@/app/portal/convenios/actions'
import { DateField, SelectField, TextAreaField } from '@/components/ui/Field'
import { FormError, SubmitButton } from '@/components/ui/Form'
import {
  breakdown,
  DEFAULT_FEE_RATE_BP,
  formatMoney,
  formatRate,
  MAX_FILE_BYTES,
  parseMoneyToCents,
  parseRateToBp,
} from '@/lib/domain/convenio'
import type { CaseOption } from '@/lib/db/settlements'

interface Person {
  id: string
  name: string
}

/**
 * REGISTRAR / CORREGIR UN CONVENIO.
 *
 * La cuenta se hace A LA VISTA mientras se escribe: lo acordado, lo que cobra
 * Solo Laboral y lo que le queda al trabajador. Quien captura tiene el convenio
 * en papel enfrente, y ver "$35,000.00" junto al monto es la forma más rápida de
 * notar que tecleó un cero de más — antes de guardar, no en la conciliación.
 *
 * La vista previa usa `breakdown()`, la misma regla de redondeo que la columna
 * generada de la base: lo que se ve es lo que se guarda.
 */
export function ConvenioForm({
  mode,
  cases = [],
  lawyers,
  today,
  defaults,
  settlementId,
  onSaved,
}: {
  mode: 'create' | 'edit'
  /** Al corregir con éxito. */
  onSaved?: () => void
  cases?: CaseOption[]
  lawyers: Person[]
  today: string
  settlementId?: string
  defaults: {
    caseId?: string
    lawyerId: string
    signedOn: string
    amount: string
    rate: string
    notes: string
  }
}) {
  const action = mode === 'create' ? createSettlementAction : updateSettlementAction
  const [state, formAction] = useFormState<ConvenioFormState, FormData>(action, {})
  const errors = state?.fieldErrors ?? {}

  useEffect(() => {
    if (state?.saved) onSaved?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.saved])

  const [amount, setAmount] = useState(defaults.amount)
  const [rate, setRate] = useState(defaults.rate)

  const agreed = parseMoneyToCents(amount)
  const rateBp = parseRateToBp(rate)
  const preview = agreed !== null && rateBp !== null ? breakdown(agreed, rateBp) : null

  return (
    <form
      action={formAction}
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        // Un archivo de más de 4.5 MB ni siquiera llega a la acción: Vercel
        // corta la petición y la pantalla se quedaría con un error genérico.
        if (hasOversizedFile(e.currentTarget)) e.preventDefault()
      }}
    >
      {settlementId ? <input type="hidden" name="settlementId" value={settlementId} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        {/* ───────────────────────────── los datos ─────────────────────────── */}
        <div className="sl-card space-y-4 p-5 sm:p-6">
          {mode === 'create' ? (
            <CasePicker cases={cases} defaultCaseId={defaults.caseId} error={errors.caseId} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="lawyerId"
              label="Abogado que llevó el convenio"
              required
              defaultValue={defaults.lawyerId}
              options={lawyers.map((l) => ({ value: l.id, label: l.name }))}
              error={errors.lawyerId}
            />
            <DateField
              name="signedOn"
              label="Fecha de firma"
              required
              defaultValue={defaults.signedOn}
              max={today}
              error={errors.signedOn}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div>
              <label htmlFor="amount" className="sl-label">
                Monto acordado con el patrón
                <span className="ml-0.5 text-sl-danger" aria-hidden>
                  *
                </span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sl-muted">
                  $
                </span>
                <input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="150,000.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => {
                    // Al salir del campo se escribe con comas: así se ve igual
                    // que en el convenio y se lee de un golpe si sobra un cero.
                    if (agreed !== null) setAmount(formatMoney(agreed).replace(/^\$/, ''))
                  }}
                  aria-invalid={errors.amount ? true : undefined}
                  aria-describedby={errors.amount ? 'amount-error' : 'amount-hint'}
                  className={clsx(
                    'sl-input pl-7 text-lg font-semibold tabular-nums',
                    errors.amount && 'border-sl-danger',
                  )}
                />
              </div>
              {errors.amount ? (
                <p id="amount-error" className="sl-error" role="alert">
                  {errors.amount}
                </p>
              ) : (
                <p id="amount-hint" className="sl-hint">
                  El total que el patrón se obliga a pagar al trabajador.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="rate" className="sl-label">
                % Solo Laboral
              </label>
              <div className="relative">
                <input
                  id="rate"
                  name="rate"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  aria-invalid={errors.rate ? true : undefined}
                  className={clsx(
                    'sl-input pr-8 text-lg font-semibold tabular-nums',
                    errors.rate && 'border-sl-danger',
                  )}
                />
                <Percent
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sl-muted"
                  aria-hidden
                />
              </div>
              {errors.rate ? (
                <p className="sl-error" role="alert">
                  {errors.rate}
                </p>
              ) : rateBp !== null && rateBp !== DEFAULT_FEE_RATE_BP ? (
                <button
                  type="button"
                  onClick={() => setRate(String(DEFAULT_FEE_RATE_BP / 100))}
                  className="mt-1 text-xs font-medium text-sl-warning hover:underline"
                >
                  Distinto al 35 % habitual · restablecer
                </button>
              ) : (
                <p className="sl-hint">Habitual: 35 %</p>
              )}
            </div>
          </div>

          {mode === 'create' ? <FilePicker error={errors.file} /> : null}

          <TextAreaField
            name="notes"
            label="Notas"
            optional
            rows={3}
            maxLength={2000}
            defaultValue={defaults.notes}
            placeholder="Centro de conciliación, número de expediente, forma y fechas de pago…"
          />
        </div>

        {/* ──────────────────────────── la cuenta ─────────────────────────── */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Desglose preview={preview} />
          <div className="mt-4 space-y-3">
            <FormError message={state?.error} />
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <SubmitButton size="lg">
                {mode === 'create' ? 'Registrar convenio' : 'Guardar corrección'}
              </SubmitButton>
            </div>
          </div>
        </aside>
      </div>
    </form>
  )
}

/** La cuenta del convenio, con la barra que reparte el monto en sus dos partes. */
function Desglose({ preview }: { preview: ReturnType<typeof breakdown> | null }) {
  const feeShare = preview && preview.agreedCents > 0 ? (preview.feeCents / preview.agreedCents) * 100 : 0

  return (
    <div className="sl-card overflow-hidden" aria-live="polite">
      <div className="bg-sl-primary px-5 py-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
          Honorarios Solo Laboral
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {preview ? formatMoney(preview.feeCents) : '$—'}
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          {preview ? `${formatRate(preview.rateBp)} sobre lo acordado con el patrón` : 'Escribe el monto acordado'}
        </p>
      </div>

      <div className="px-5 py-4">
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-sl-primary-soft"
          role="img"
          aria-label={
            preview
              ? `${formatRate(preview.rateBp)} para Solo Laboral, el resto para el trabajador`
              : 'Sin monto'
          }
        >
          <span
            className="block h-full shrink-0 bg-sl-secondary"
            style={{ width: `${feeShare}%` }}
          />
          <span
            className="block h-full shrink-0 bg-sl-accent"
            style={{ width: preview ? `${100 - feeShare}%` : '0%' }}
          />
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          <Linea label="Acordado con el patrón" value={preview ? formatMoney(preview.agreedCents) : '—'} strong />
          <Linea
            label="Solo Laboral"
            dot="bg-sl-secondary"
            value={preview ? `− ${formatMoney(preview.feeCents)}` : '—'}
          />
          <div className="border-t border-dashed border-sl-border pt-2.5">
            <Linea
              label="Le queda al trabajador"
              dot="bg-sl-accent"
              value={preview ? formatMoney(preview.clientNetCents) : '—'}
              strong
            />
          </div>
        </dl>
      </div>
    </div>
  )
}

function Linea({
  label,
  value,
  strong,
  dot,
}: {
  label: string
  value: string
  strong?: boolean
  dot?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2 text-sl-muted">
        {dot ? <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden /> : null}
        {label}
      </dt>
      <dd className={clsx('tabular-nums', strong ? 'font-semibold text-sl-text' : 'text-sl-text')}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Elegir el caso. Con decenas de casos un `<select>` a secas obliga a recorrer
 * la lista entera; el buscador filtra por nombre o folio y el `<select>` sigue
 * siendo el que envía el valor, así que funciona igual sin teclado.
 */
function CasePicker({
  cases,
  defaultCaseId,
  error,
}: {
  cases: CaseOption[]
  defaultCaseId?: string
  error?: string
}) {
  const [needle, setNeedle] = useState('')
  const [selected, setSelected] = useState(defaultCaseId ?? '')

  const visible = useMemo(() => {
    const q = needle.trim().toLowerCase()
    if (!q) return cases
    return cases.filter(
      (c) => c.id === selected || c.clientName.toLowerCase().includes(q) || c.folio.toLowerCase().includes(q),
    )
  }, [cases, needle, selected])

  return (
    <div>
      <label htmlFor="caseId" className="sl-label">
        Caso
        <span className="ml-0.5 text-sl-danger" aria-hidden>
          *
        </span>
      </label>
      {cases.length > 8 ? (
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sl-muted"
            aria-hidden
          />
          <input
            type="search"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder="Buscar por nombre o folio…"
            aria-label="Buscar caso"
            className="sl-input pl-9"
          />
        </div>
      ) : null}
      <select
        id="caseId"
        name="caseId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        className={clsx('sl-input', error && 'border-sl-danger')}
      >
        <option value="" disabled>
          {visible.length ? 'Elige el caso…' : 'Ningún caso coincide'}
        </option>
        {visible.map((c) => (
          <option key={c.id} value={c.id}>
            {c.folio} · {c.clientName}
            {c.isDemo ? ' (demo)' : ''}
          </option>
        ))}
      </select>
      {error ? (
        <p className="sl-error" role="alert">
          {error}
        </p>
      ) : cases.length === 0 ? (
        <p className="sl-hint">
          Todavía no hay casos. Un convenio cuelga de un caso: convierte primero el lead.
        </p>
      ) : null}
    </div>
  )
}

export function hasOversizedFile(form: HTMLFormElement): boolean {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]')).some((input) =>
    Array.from(input.files ?? []).some((f) => f.size > MAX_FILE_BYTES),
  )
}

/** El documento firmado. En el teléfono, `image/*` deja tomarle foto al papel. */
export function FilePicker({ error, name = 'file' }: { error?: string; name?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const tooBig = file !== null && file.size > MAX_FILE_BYTES

  return (
    <div>
      <span className="sl-label block">
        Convenio firmado <span className="text-xs font-normal text-sl-muted">(PDF o foto, hasta 4 MB)</span>
      </span>
      <label
        className={clsx(
          'flex cursor-pointer items-center gap-3 rounded-sl border-2 border-dashed px-4 py-4 transition-colors',
          error || tooBig
            ? 'border-sl-danger/60 bg-sl-danger/5'
            : file
              ? 'border-sl-success/50 bg-sl-success/5'
              : 'border-sl-border hover:border-sl-secondary hover:bg-sl-secondary/5',
        )}
      >
        <span
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            file ? 'bg-sl-success/15 text-sl-success' : 'bg-sl-primary-soft text-sl-primary',
          )}
        >
          {file ? <Paperclip className="h-5 w-5" aria-hidden /> : <FileUp className="h-5 w-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sl-text">
            {file ? file.name : 'Elegir archivo o tomar foto'}
          </span>
          <span className="block text-xs text-sl-muted">
            {file ? `${(file.size / 1_000_000).toFixed(1)} MB` : 'Puedes subir más documentos después'}
          </span>
        </span>
        <input
          ref={input}
          type="file"
          name={name}
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setFile(f ? { name: f.name, size: f.size } : null)
          }}
        />
        {file ? (
          <button
            type="button"
            aria-label="Quitar archivo"
            onClick={(e) => {
              e.preventDefault()
              if (input.current) input.current.value = ''
              setFile(null)
            }}
            className="sl-btn-ghost px-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </label>
      {tooBig ? (
        <p className="sl-error" role="alert">
          Pesa más de 4 MB y no se va a poder subir. Compártelo en PDF comprimido o como foto.
        </p>
      ) : error ? (
        <p className="sl-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
