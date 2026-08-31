'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import clsx from 'clsx'
import { AlignLeft, Briefcase, Clock, Info, User, X } from 'lucide-react'
import { createEventAction } from '@/app/portal/calendario/actions'
import type { EventState } from '@/app/portal/calendario/actions'
import { FormError, SubmitButton } from '@/components/ui/Form'
import { EVENT_TYPE_LABEL } from '@/lib/domain/labels'
import { formatDateLong } from '@/lib/dates'
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

/** Los que ya tienen su propio sitio en la ruta del caso y conviene avisar. */
const DE_LA_RUTA: EventType[] = ['hearing', 'conciliation']

export interface CaseOption {
  id: string
  label: string
}

export interface BorradorActividad {
  day: string
  startTime: string
  endTime: string
}

/**
 * NUEVA ACTIVIDAD, EN EL GLOBO.
 *
 * Se llena de arriba abajo en el orden en que uno lo piensa: primero de qué es
 * —el campo grande, ya enfocado, porque en el 90% de los casos se escribe el
 * título y se guarda—, luego qué tipo, y solo después el detalle. El día y la
 * hora llegan puestos por el gesto que abrió el globo, así que casi nunca hay
 * que tocarlos, pero siguen siendo campos editables: corregir media hora no
 * debería obligar a cerrar y volver a arrastrar.
 *
 * La nota empieza plegada. Es opcional y larga, y desplegada convierte un globo
 * de diez segundos en un formulario.
 *
 * El aviso de las audiencias ya no está siempre: sale solo cuando el tipo
 * elegido es de los que la ruta del caso agenda sola. Un aviso permanente se
 * vuelve parte del decorado y deja de leerse justo el día que importa.
 */
export function NuevaActividadForm({
  draft,
  cases,
  users,
  onClose,
  onCreated,
}: {
  draft: BorradorActividad
  cases: CaseOption[]
  users: PublicStaffUser[]
  onClose: () => void
  onCreated: (mensaje: string) => void
}) {
  const [state, formAction] = useFormState<EventState, FormData>(createEventAction, {})
  const [eventType, setEventType] = useState<EventType>('meeting')
  const [conNota, setConNota] = useState(false)
  const [day, setDay] = useState(draft.day)

  // Se cierra cuando el servidor confirma. El sello distingue un guardado nuevo
  // de la misma respuesta ya vista: sin él, la segunda actividad seguida no
  // cerraría el globo.
  const visto = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (state.ok && state.token !== visto.current) {
      visto.current = state.token
      onCreated(state.ok)
    }
  }, [state, onCreated])

  return (
    <form action={formAction} className="p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <input
          data-autofocus
          name="title"
          required
          maxLength={200}
          aria-label="De qué es la actividad"
          placeholder="Agregar título"
          className="min-w-0 flex-1 border-0 border-b-2 border-sl-border bg-transparent px-0 py-1.5
            text-lg font-medium text-sl-text placeholder:font-normal placeholder:text-sl-muted
            focus:border-sl-primary focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-sl-muted transition-colors hover:bg-sl-primary-soft hover:text-sl-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* ── qué tipo de actividad: pastillas, no un desplegable ──
          Son siete opciones fijas y la elección cambia el color del bloque en la
          rejilla; verlas todas de golpe se decide más rápido que abriendo una
          lista. El valor viaja en radios de verdad, así que el teclado las
          recorre con las flechas. */}
      <fieldset className="mb-3 mt-3">
        <legend className="sr-only">Tipo de actividad</legend>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((type) => (
            <label
              key={type}
              className={clsx(
                'cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                eventType === type
                  ? 'bg-sl-primary text-white'
                  : 'bg-sl-background text-sl-muted hover:bg-sl-primary-soft hover:text-sl-text',
              )}
            >
              <input
                type="radio"
                name="eventType"
                value={type}
                checked={eventType === type}
                onChange={() => setEventType(type)}
                className="sr-only"
              />
              {EVENT_TYPE_LABEL[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3">
        {/* ── cuándo ── */}
        <div className="flex gap-3">
          <Clock className="mt-2 h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1.5">
            <input
              type="date"
              name="day"
              required
              value={day}
              onChange={(event) => setDay(event.target.value)}
              aria-label="Día"
              className="sl-input py-1.5"
            />
            {/* `min-w-0` no es cosmético: un campo de hora nativo trae su ancho
                mínimo puesto, y sin esto los dos no encogen y el de fin se sale
                por el borde derecho del teléfono. */}
            <div className="flex items-center gap-2">
              <input
                type="time"
                name="time"
                required
                defaultValue={draft.startTime}
                aria-label="Hora de inicio"
                className="sl-input min-w-0 py-1.5"
              />
              <span className="shrink-0 text-sm text-sl-muted" aria-hidden>
                –
              </span>
              <input
                type="time"
                name="endTime"
                defaultValue={draft.endTime}
                aria-label="Hora de fin"
                className="sl-input min-w-0 py-1.5"
              />
            </div>
            <p className="text-xs text-sl-muted first-letter:uppercase">{formatDateLong(day)}</p>
          </div>
        </div>

        {/* ── quién lo lleva ── */}
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          <select
            name="assignedUserId"
            defaultValue=""
            aria-label="Responsable"
            className="sl-input py-1.5"
          >
            <option value="">Yo</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        {/* ── de qué caso es ── */}
        <div className="flex items-center gap-3">
          <Briefcase className="h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          <select name="caseId" defaultValue="" aria-label="Caso" className="sl-input py-1.5">
            <option value="">Sin caso</option>
            {cases.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── la nota, plegada ── */}
        <div className="flex gap-3">
          <AlignLeft className="mt-1.5 h-4 w-4 shrink-0 text-sl-muted" aria-hidden />
          {conNota ? (
            <textarea
              name="description"
              rows={2}
              maxLength={1000}
              autoFocus
              aria-label="Nota"
              placeholder="Dónde es, qué hay que llevar, con quién…"
              className="sl-input py-1.5"
            />
          ) : (
            <button
              type="button"
              onClick={() => setConNota(true)}
              className="rounded-sl px-1 py-1 text-left text-sm text-sl-muted transition-colors hover:text-sl-text"
            >
              Agregar una nota
            </button>
          )}
        </div>
      </div>

      {DE_LA_RUTA.includes(eventType) ? (
        <p className="sl-in mt-3 flex items-start gap-2 rounded-sl bg-sl-primary-soft/60 px-3 py-2 text-xs text-sl-text">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sl-primary" aria-hidden />
          <span>
            Si además es un paso de la ruta del caso, mejor ponle la fecha a ese paso: aparece aquí
            sola y no quedan dos versiones de la misma cita.
          </span>
        </p>
      ) : null}

      <div className="mt-4">
        <FormError message={state.error} />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="sl-btn-ghost">
          Cancelar
        </button>
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </form>
  )
}
