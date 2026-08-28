'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { ArrowDown, ArrowUp, CircleCheck, Plus } from 'lucide-react'
import clsx from 'clsx'
import {
  addTemplateItemAction,
  moveTemplateItemAction,
  setTemplateItemActiveAction,
  updateTemplateItemAction,
} from '@/app/portal/administracion/actions'
import type { AdminState } from '@/app/portal/administracion/actions'
import { FormError, SubmitButton } from '@/components/ui/Form'
import { Badge } from '@/components/ui/Badge'
import type { ChecklistTemplate, ChecklistTemplateItem } from '@/lib/domain/types'

function Ok({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      role="status"
      className="sl-in flex items-start gap-2 rounded-sl border border-sl-success/30 bg-sl-success/5 px-3 py-2.5 text-sm text-sl-success"
    >
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

/**
 * LA RUTA DEL CASO, editable.
 *
 * Estos pasos son las columnas de la cuadrícula de Seguimiento y los renglones
 * de la ruta de cada caso. Cambiarlos aquí NO reescribe nada de lo que ya está
 * en curso: al convertir un lead, los pasos se COPIAN al caso. Cambiar hoy el
 * procedimiento del despacho no puede alterar el expediente de un asunto que
 * alguien está trabajando.
 *
 * Por eso no hay botón de borrar, sino de RETIRAR. Un paso retirado deja de
 * entrar en los casos nuevos y sigue entero en los que ya lo llevan; borrarlo
 * dejaría a esos casos sin la referencia con la que la cuadrícula empareja cada
 * casilla con su columna, y la base directamente lo impide.
 */
export function Plantilla({ template }: { template: ChecklistTemplate | null }) {
  const [add, addAction] = useFormState<AdminState, FormData>(addTemplateItemAction, {})
  const [status, statusAction] = useFormState<AdminState, FormData>(
    setTemplateItemActiveAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!template) {
    return (
      <section className="sl-card px-5 py-6">
        <h2 className="sl-eyebrow">Ruta del caso</h2>
        <p className="mt-2 text-sm text-sl-muted">
          No hay ninguna plantilla activa. Sin ella no se puede convertir un lead en caso.
        </p>
      </section>
    )
  }

  const vigentes = template.items.filter((item) => item.isActive)
  const retirados = template.items.filter((item) => !item.isActive)

  return (
    <section className="sl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border px-5 py-3.5">
        <div>
          <h2 className="sl-eyebrow">Ruta del caso</h2>
          <p className="mt-0.5 text-xs text-sl-muted">
            {template.name} · {vigentes.length} paso{vigentes.length === 1 ? '' : 's'} vigente
            {vigentes.length === 1 ? '' : 's'}
            {retirados.length > 0 ? ` · ${retirados.length} retirado${retirados.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        {open ? null : (
          <button type="button" onClick={() => setOpen(true)} className="sl-btn-secondary">
            <Plus className="h-4 w-4" aria-hidden />
            Añadir paso
          </button>
        )}
      </div>

      <div className="border-b border-sl-border bg-sl-primary-soft/40 px-5 py-3 text-xs text-sl-text">
        Estos pasos son las columnas de Seguimiento. Lo que cambies aquí entra en los casos{' '}
        <strong className="font-semibold">nuevos</strong>: los que ya están en curso conservan la
        ruta con la que nacieron.
      </div>

      {open ? (
        <form action={addAction} className="space-y-3 border-b border-sl-border bg-sl-background px-5 py-4">
          <FormError message={add.error} />
          <input type="hidden" name="templateId" value={template.id} />
          <div>
            <label htmlFor="paso-titulo" className="sl-label">Título del paso</label>
            <input id="paso-titulo" name="title" required maxLength={200} className="sl-input" />
          </div>
          <div>
            <label htmlFor="paso-desc" className="sl-label">
              Descripción <span className="font-normal text-sl-muted">(opcional)</span>
            </label>
            <input
              id="paso-desc"
              name="description"
              maxLength={500}
              className="sl-input"
              placeholder="Qué hay que hacer en este paso"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>Añadir al final</SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="sl-btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {add.ok || status.ok || status.error ? (
        <div className="space-y-2 px-5 pt-4">
          <Ok message={add.ok} />
          <Ok message={status.ok} />
          <FormError message={status.error} />
        </div>
      ) : null}

      <ol className="divide-y divide-sl-border">
        {template.items.map((item, index) => (
          <Paso
            key={item.id}
            item={item}
            index={index}
            first={index === 0}
            last={index === template.items.length - 1}
            statusAction={statusAction}
          />
        ))}
      </ol>
    </section>
  )
}

function Paso({
  item,
  index,
  first,
  last,
  statusAction,
}: {
  item: ChecklistTemplateItem
  index: number
  first: boolean
  last: boolean
  statusAction: (formData: FormData) => void
}) {
  const [edit, editAction] = useFormState<AdminState, FormData>(updateTemplateItemAction, {})

  return (
    <li className={clsx('px-5 py-3.5', !item.isActive && 'bg-sl-background')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-sm font-semibold tabular-nums text-sl-muted">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
            <span className={item.isActive ? 'text-sl-text' : 'text-sl-muted line-through'}>
              {item.title}
            </span>
            {item.isActive ? null : <Badge tone="neutral">Retirado</Badge>}
          </p>
          {item.description ? (
            <p className="mt-0.5 text-sm text-sl-muted">{item.description}</p>
          ) : null}
          {/* Lo que hace visible que retirar no es borrar. */}
          {item.usedByCases ? (
            <p className="mt-0.5 text-xs text-sl-muted">
              En {item.usedByCases} caso{item.usedByCases === 1 ? '' : 's'}
              {item.isActive ? '' : ' · lo conservan'}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <form action={statusAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="active" value={item.isActive ? 'no' : 'si'} />
              <button
                type="submit"
                className="rounded-full border border-sl-border px-3 py-1 text-xs font-medium text-sl-text transition-colors hover:bg-sl-primary-soft"
              >
                {item.isActive ? 'Retirar' : 'Reponer'}
              </button>
            </form>

            <details className="w-full">
              <summary className="cursor-pointer list-none text-xs font-medium text-sl-primary hover:underline">
                Editar el texto
              </summary>
              <form action={editAction} className="mt-2 space-y-2 rounded-sl bg-sl-surface p-3">
                <FormError message={edit.error} />
                <Ok message={edit.ok} />
                <input type="hidden" name="itemId" value={item.id} />
                <input
                  name="title"
                  defaultValue={item.title}
                  maxLength={200}
                  className="sl-input text-sm"
                  aria-label={`Título de ${item.title}`}
                />
                <input
                  name="description"
                  defaultValue={item.description}
                  maxLength={500}
                  className="sl-input text-sm"
                  aria-label={`Descripción de ${item.title}`}
                  placeholder="Descripción (opcional)"
                />
                <p className="text-xs text-sl-muted">
                  Los casos que ya llevan este paso conservan el texto con el que nacieron.
                </p>
                <SubmitButton variant="secondary">Guardar</SubmitButton>
              </form>
            </details>
          </div>
        </div>

        {/* Subir y bajar en vez de arrastrar: arrastrar necesita JavaScript y
            un puntero fino, y esto se usa también desde el teléfono. */}
        <div className="flex shrink-0 flex-col gap-1">
          <form action={moveTemplateItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={first}
              aria-label={`Subir ${item.title}`}
              className="flex h-7 w-7 items-center justify-center rounded-sl border border-sl-border text-sl-text transition-colors hover:bg-sl-primary-soft disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </button>
          </form>
          <form action={moveTemplateItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={last}
              aria-label={`Bajar ${item.title}`}
              className="flex h-7 w-7 items-center justify-center rounded-sl border border-sl-border text-sl-text transition-colors hover:bg-sl-primary-soft disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </li>
  )
}
