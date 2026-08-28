'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { CalendarPlus, CircleCheck, Info } from 'lucide-react'
import { createEventAction } from '@/app/portal/calendario/actions'
import type { EventState } from '@/app/portal/calendario/actions'
import { FormError, SubmitButton } from '@/components/ui/Form'
import { EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import type { EventType, PublicStaffUser } from '@/lib/domain/types'

/** El seguimiento primero: es el que más se agenda tras una llamada. */
const EVENT_TYPES: EventType[] = [
  'meeting',
  'call',
  'hearing',
  'conciliation',
  'follow_up',
  'deadline',
  'other',
]

export interface CaseOption {
  id: string
  label: string
}

/**
 * NUEVA ACTIVIDAD.
 *
 * Qué es, cuándo, y a qué caso se liga. El caso es opcional —una junta interna
 * o un recordatorio no son de nadie en particular— pero cuando se elige, la
 * actividad aparece también en la ficha de ese caso y hereda su cliente y su
 * folio en la agenda. Sin caso ni responsable la cita no sería de nadie y no
 * volvería a encontrarse, así que cae por omisión en quien la crea.
 *
 * El aviso sobre las audiencias no es decoración: la ruta del caso ya agenda
 * sola al ponerle fecha a un paso, y capturar aquí lo mismo deja dos registros
 * del mismo hecho que a la semana no coinciden.
 */
export function NuevaActividad({
  cases,
  users,
  defaultDay,
}: {
  cases: CaseOption[]
  users: PublicStaffUser[]
  /** El día que está seleccionado en la rejilla: el que se va a agendar. */
  defaultDay: string
}) {
  const [state, formAction] = useFormState<EventState, FormData>(createEventAction, {})
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="sl-btn-primary">
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Nueva actividad
        </button>
        {state.ok ? (
          <p
            role="status"
            className="sl-in mt-2 flex items-center gap-1.5 text-sm text-sl-success"
          >
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
            {state.ok}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction} className="sl-card sl-in space-y-3 p-4">
      <h3 className="text-sm font-semibold text-sl-text">Nueva actividad</h3>
      <FormError message={state.error} />

      <div>
        <label htmlFor="act-titulo" className="sl-label">De qué es</label>
        <input
          id="act-titulo"
          name="title"
          required
          maxLength={200}
          className="sl-input"
          placeholder="Junta con el cliente, entrega de documentos…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="act-tipo" className="sl-label">Tipo de actividad</label>
          <select id="act-tipo" name="eventType" defaultValue="meeting" className="sl-input">
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVENT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="act-caso" className="sl-label">
            Caso <span className="font-normal text-sl-muted">(opcional)</span>
          </label>
          <select id="act-caso" name="caseId" defaultValue="" className="sl-input">
            <option value="">Sin caso</option>
            {cases.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="act-dia" className="sl-label">Día</label>
          <input
            id="act-dia"
            type="date"
            name="day"
            required
            defaultValue={defaultDay}
            className="sl-input"
          />
        </div>
        <div>
          <label htmlFor="act-hora" className="sl-label">Hora</label>
          <input
            id="act-hora"
            type="time"
            name="time"
            required
            defaultValue="10:00"
            className="sl-input"
          />
        </div>
        <div>
          <label htmlFor="act-fin" className="sl-label">
            Termina <span className="font-normal text-sl-muted">(opcional)</span>
          </label>
          <input id="act-fin" type="time" name="endTime" className="sl-input" />
        </div>
      </div>

      <div>
        <label htmlFor="act-resp" className="sl-label">Responsable</label>
        <select id="act-resp" name="assignedUserId" defaultValue="" className="sl-input">
          <option value="">Yo</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="act-nota" className="sl-label">
          Nota <span className="font-normal text-sl-muted">(opcional)</span>
        </label>
        <textarea
          id="act-nota"
          name="description"
          rows={2}
          maxLength={1000}
          className="sl-input"
          placeholder="Dónde es, qué hay que llevar, con quién…"
        />
      </div>

      <p className="flex items-start gap-2 rounded-sl bg-sl-primary-soft/60 px-3 py-2 text-xs text-sl-text">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sl-primary" aria-hidden />
        <span>
          Si es una <strong className="font-semibold">audiencia o conciliación</strong> que además
          es un paso de la ruta del caso, mejor ponle la fecha a ese paso: aparece aquí sola y no
          quedan dos versiones de la misma cita.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>Agendar</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="sl-btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}
