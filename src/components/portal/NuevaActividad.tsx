'use client'

import { CalendarPlus } from 'lucide-react'
import { useAgenda } from '@/components/portal/AgendaProvider'
import { anchorFromElement } from '@/components/ui/Popover'
import { DEFAULT_DURATION_MINUTES, MINUTES_PER_DAY, SLOT_MINUTES } from '@/lib/agenda/layout'
import { minutesOfDay, nowIso, timeFromMinutes, today } from '@/lib/dates'
import type { PlainDate } from '@/lib/dates'

export type { CaseOption } from '@/components/portal/NuevaActividadForm'

/**
 * EL BOTÓN DE LA BARRA.
 *
 * Abre el mismo globo que un arrastre sobre la rejilla —no hay dos formularios
 * de alta— y llega con el día que esté elegido. La hora la propone al pulsar y
 * no al pintar la página: una pestaña abierta desde la mañana ofrecería las
 * 9:00 a las seis de la tarde.
 *
 * En el día de hoy propone el siguiente cuarto de hora en punto, que es cuando
 * de verdad se puede hacer algo; en cualquier otro día, las 10:00.
 */
export function NuevaActividad({ defaultDay }: { defaultDay: PlainDate }) {
  const { crear } = useAgenda()

  return (
    <button
      type="button"
      className="sl-btn-primary"
      onClick={(evento) => {
        const inicio =
          defaultDay === today()
            ? Math.min(
                Math.ceil(minutesOfDay(nowIso()) / SLOT_MINUTES) * SLOT_MINUTES,
                MINUTES_PER_DAY - DEFAULT_DURATION_MINUTES,
              )
            : 10 * 60
        crear(
          {
            day: defaultDay,
            startTime: timeFromMinutes(inicio),
            endTime: timeFromMinutes(Math.min(inicio + DEFAULT_DURATION_MINUTES, MINUTES_PER_DAY)),
          },
          anchorFromElement(evento.currentTarget),
        )
      }}
    >
      <CalendarPlus className="h-4 w-4" aria-hidden />
      Nueva actividad
    </button>
  )
}
