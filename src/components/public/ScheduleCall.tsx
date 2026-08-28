'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { CalendarCheck, CalendarClock, CircleAlert } from 'lucide-react'
import { scheduleCallAction } from '@/app/solicitud/actions'
import { INITIAL_SCHEDULE_STATE } from '@/lib/domain/lead-submission'
import {
  callDayOptions,
  callTimeLabel,
  callTimesByHour,
  formatCallTime,
} from '@/lib/domain/call-time'
import { formatDateChip, formatDateLong } from '@/lib/dates'

/**
 * ELEGIR CUÁNDO LLAMAR.
 *
 * FUERA DEL FLUJO PÚBLICO desde el 2026-08-28, por decisión del despacho: la
 * pantalla de continuación quedó con dos caminos —WhatsApp y "que me llamen"—
 * y esta tercera opción se retiró. El componente y su acción de servidor se
 * conservan intactos porque el despacho puede querer recuperarla, el portal
 * sigue mostrando la hora pedida cuando existe, y las pruebas de la cookie
 * firmada siguen cubriéndola.
 *
 * Para volver a ofrecerla, se renderiza desde `ContactOptions`.
 *
 * Se pide día y HORA EXACTA, de 9:30 a 17:30 cada diez minutos. Sigue siendo
 * una preferencia y no una reserva —el sistema no conoce la agenda de los
 * abogados—, así que el texto dice "haremos lo posible" y en ningún momento
 * "tienes una cita". La diferencia importa: quien espera una llamada no debería
 * quedarse pendiente cinco horas, pero tampoco sentirse incumplido a las 9:31.
 *
 * Es OPCIONAL y se dice: el abogado va a llamar igual. Quien no quiera pensar
 * en horarios ahora mismo —que es mucha gente en este momento de su vida— se
 * salta el paso sin perder nada.
 */
/**
 * Hora marcada de salida. Se elige una redonda y temprana en vez de la primera
 * de la lista: 10:00 es una hora que la gente reconoce, 9:30 parece el residuo
 * de empezar a contar.
 */
const DEFAULT_TIME = '10:00'

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
          <strong className="font-semibold">{formatDateLong(state.preference.date)}</strong> a las{' '}
          <strong className="font-semibold">{formatCallTime(state.preference.time)}</strong>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-sl-muted">
          Es la hora que pediste y haremos lo posible por marcarte en ella. Si surge algo, te
          llamaremos en cuanto podamos ese mismo día.
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
        <legend className="sl-eyebrow">Hora</legend>
        {/*
          Cuarenta y nueve horas no caben en pantalla y apiladas en una sola
          lista se vuelven ilegibles. Se agrupan por hora en punto y el bloque
          entero hace scroll: así se recorre "las diez", "las once", en vez de
          contar pastillas de diez en diez.
        */}
        <div className="mt-2 max-h-64 overflow-y-auto rounded-sl border border-sl-border bg-sl-surface px-3 py-2">
          {callTimesByHour().map((group) => (
            <div key={group.hour} className="py-1.5">
              <p className="mb-1.5 text-xs font-semibold tabular-nums text-sl-muted">
                {group.hour}:00
              </p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {group.times.map((time) => (
                  <label key={time}>
                    <input
                      type="radio"
                      name="callTime"
                      value={time}
                      defaultChecked={time === DEFAULT_TIME}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-[40px] cursor-pointer items-center justify-center rounded-sl border border-sl-border bg-sl-background px-1 text-sm tabular-nums text-sl-text transition-colors peer-checked:border-sl-primary peer-checked:bg-sl-primary peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sl-primary">
                      {callTimeLabel(time)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
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
