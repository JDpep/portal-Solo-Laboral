'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Ban, CheckCircle2, Pencil, Upload } from 'lucide-react'
import {
  addFileAction,
  voidSettlementAction,
  type SimpleState,
} from '@/app/portal/convenios/actions'
import { ConvenioForm, FilePicker, hasOversizedFile } from '@/components/portal/ConvenioForm'
import { FormError } from '@/components/ui/Form'

/** Subir otro documento al convenio: anexos, comprobantes de pago, la versión sellada. */
export function SubirDocumento({ settlementId }: { settlementId: string }) {
  const [state, formAction] = useFormState<SimpleState, FormData>(addFileAction, {})
  const [key, setKey] = useState(0)
  const form = useRef<HTMLFormElement>(null)

  // Tras subir bien, el selector vuelve a quedar vacío para el siguiente.
  useEffect(() => {
    if (state?.ok) setKey((k) => k + 1)
  }, [state])

  return (
    <form
      ref={form}
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        if (hasOversizedFile(e.currentTarget)) e.preventDefault()
      }}
    >
      <input type="hidden" name="settlementId" value={settlementId} />
      <FilePicker key={key} />
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="sl-in flex items-center gap-1.5 text-sm text-sl-success" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {state?.ok}
        </p>
      ) : null}
      <Boton icon={<Upload className="h-4 w-4" aria-hidden />} pending="Subiendo…">
        Subir documento
      </Boton>
    </form>
  )
}

/**
 * ANULAR. No es borrar, y se dice antes de pulsar: el convenio sigue visible
 * con su motivo y deja de sumar en los indicadores.
 */
export function AnularConvenio({ settlementId }: { settlementId: string }) {
  const [state, formAction] = useFormState<SimpleState, FormData>(voidSettlementAction, {})
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="sl-btn-secondary text-sl-danger">
        <Ban className="h-4 w-4" aria-hidden />
        Anular
      </button>
    )
  }

  return (
    <form action={formAction} className="sl-card sl-in w-full space-y-3 p-4">
      <input type="hidden" name="settlementId" value={settlementId} />
      <div>
        <h3 className="text-sm font-semibold text-sl-text">¿Anular este convenio?</h3>
        <p className="mt-0.5 text-xs text-sl-muted">
          No se borra: queda visible con su motivo y deja de sumar en los honorarios.
        </p>
      </div>
      <div>
        <label htmlFor="void-reason" className="sl-label">
          Motivo
        </label>
        <textarea
          id="void-reason"
          name="reason"
          rows={2}
          required
          maxLength={1000}
          className="sl-input"
          placeholder="Capturado dos veces, el patrón no firmó…"
        />
      </div>
      <FormError message={state?.error} />
      <div className="flex flex-wrap gap-2">
        <Boton icon={<Ban className="h-4 w-4" aria-hidden />} pending="Anulando…" danger>
          Anular convenio
        </Boton>
        <button type="button" onClick={() => setOpen(false)} className="sl-btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

/** Corregir los datos del convenio sin salir de su ficha. */
export function CorregirConvenio(
  props: Omit<React.ComponentProps<typeof ConvenioForm>, 'mode' | 'onSaved'>,
) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setSaved(false)
            setOpen(true)
          }}
          className="sl-btn-secondary"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Corregir
        </button>
        {saved ? (
          <span className="sl-in flex items-center gap-1.5 text-sm text-sl-success" role="status">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Corrección guardada
          </span>
        ) : null}
      </div>
    )
  }
  return (
    <div className="sl-in w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-sl-text">Corregir convenio</h2>
        <button type="button" onClick={() => setOpen(false)} className="sl-btn-ghost">
          Cancelar
        </button>
      </div>
      <ConvenioForm
        mode="edit"
        {...props}
        onSaved={() => {
          setSaved(true)
          setOpen(false)
        }}
      />
    </div>
  )
}

function Boton({
  children,
  icon,
  pending,
  danger,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  pending: string
  danger?: boolean
}) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className={danger ? 'sl-btn bg-sl-danger text-white hover:bg-sl-danger/90' : 'sl-btn-primary'}
    >
      {status.pending ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden
        />
      ) : (
        icon
      )}
      {status.pending ? pending : children}
    </button>
  )
}
