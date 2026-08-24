'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { CalendarCheck, CalendarClock, CircleAlert } from 'lucide-react'
import { scheduleCallAction } from '@/app/solicitud/actions'
import { INITIAL_SCHEDULE_STATE } from '@/lib/domain/lead-submission'
import {
  CALL_SLOTS,
  CALL_SLOT_LABEL,
  CALL_SLOT_RANGE,
  callDayOptions,
} from '@/lib/domain/call-slot'
import { formatDateChip, formatDateLong } from '@/lib/dates'

/**
 * ELEGIR CUÁNDO LLAMAR. Solo aparece si el caso pasó el filtro.
 *
 * Lo que se pide es una FRANJA, no una cita: día y mañana/tarde. El despacho
 * no publica disponibilidad, así que ofrecer una hora exacta sería fabricar un
 * compromiso que nadie firmó. El texto lo dice con todas sus letras para que
 * nadie se quede esperando junto al teléfono a una hora que nunca se prometió.
 *
 * Es OPCIONAL y se dice: el abogado va a llamar igual. Quien no quiera pensar
 * en horarios ahora mismo —que es mucha gente en este momento de su vida— se
 * salta el paso sin perder nada.
 */
export function ScheduleCall({ todayDate }: { todayDate: string }) {
  const [state, formAction] = useFormState(scheduleCallAction, INITIAL_SCHEDULE_STATE)
  const [skipped, setSkipped] = useState(false)
  const days = callDayOptions(todayDate)

  if (state.status === 'scheduled') {
    return (
      <div className="sl-in mt-6 rounded-sl border border-sl-success/25 bg-sl-success/5 px-5 py-5 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-sl-success">
          <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden />
          Horario anotado
        </p>
        <p className="mt-2 text-sm leading-relaxed text-sl-text">
          Te llamaremos el{' '}
          <strong className="font-semibold">{formatDateLong(state.preference.date)}</strong>,{' '}
          {CALL_SLOT_LABEL[state.preference.slot].toLowerCase()} (
          {CALL_SLOT_RANGE[state.preference.slot]}).
        </p>
        <p className="mt-2 text-xs leading-relaxed text-sl-muted">
          Es la franja que pediste, no una cita a una hora exacta. Haremos lo posible por marcarte
          dentro de ella.
        </p>
      </div>
    )
  }

  if (skipped) {
    return (
      <p className="sl-in mt-6 text-sm text-sl-muted">
        Sin problema. Un abogado te llamará al número que nos diste.
      </p>
    )
  }

  return (
    <form
      action={formAction}
      className="sl-in mt-6 rounded-sl border border-sl-border bg-sl-background px-5 py-5 text-left"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-sl-text">
        <CalendarClock className="h-4 w-4 shrink-0 text-sl-secondary-strong" aria-hidden />
        ¿Cuándo te viene bien que te llamemos?
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-sl-muted">
        Opcional. Nos ayuda a no marcarte cuando no puedas contestar.
      </p>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="sl-in mt-3 flex items-start gap-2 rounded-sl border border-sl-danger/30 bg-sl-danger/5 px-3 py-2.5 text-xs leading-relaxed text-sl-danger"
        >
          <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}

      <fieldset className="mt-4 min-w-0">
        <legend className="sl-eyebrow">Día</legend>
        {/* Los días desbordan a la derecha en el teléfono en vez de apilarse:
            cinco pastillas apiladas empujaban el botón fuera de la pantalla. */}
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day, i) => (
            <label key={day} className="shrink-0">
              <input
                type="radio"
                name="callDate"
                value={day}
                defaultChecked={i === 0}
                className="peer sr-only"
              />
              <span className="flex min-h-[44px] cursor-pointer items-center rounded-sl border border-sl-border bg-sl-surface px-3.5 text-sm capitalize text-sl-text transition-colors peer-checked:border-sl-primary peer-checked:bg-sl-primary peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sl-primary">
                {formatDateChip(day)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 min-w-0">
        <legend className="sl-eyebrow">Horario</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CALL_SLOTS.map((slot, i) => (
            <label key={slot}>
              <input
                type="radio"
                name="callSlot"
                value={slot}
                defaultChecked={i === 0}
                className="peer sr-only"
              />
              <span className="flex min-h-[52px] cursor-pointer flex-col justify-center rounded-sl border border-sl-border bg-sl-surface px-3 py-2 text-sm text-sl-text transition-colors peer-checked:border-sl-primary peer-checked:bg-sl-primary peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sl-primary">
                <span className="font-medium">{CALL_SLOT_LABEL[slot]}</span>
                <span className="text-xs opacity-80">{CALL_SLOT_RANGE[slot]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
        <ConfirmButton />
        <button type="button" onClick={() => setSkipped(true)} className="sl-btn-ghost sm:px-3">
          Ahora no
        </button>
      </div>
    </form>
  )
}

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="sl-btn-primary flex-1" disabled={pending}>
      {pending ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden
        />
      ) : (
        <CalendarCheck className="h-4 w-4" aria-hidden />
      )}
      {pending ? 'Guardando…' : 'Confirmar horario'}
    </button>
  )
}
