'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Popover } from '@/components/ui/Popover'
import type { Anchor } from '@/components/ui/Popover'
import { NuevaActividadForm } from '@/components/portal/NuevaActividadForm'
import type { BorradorActividad, CaseOption } from '@/components/portal/NuevaActividadForm'
import { EventoDetalle } from '@/components/portal/EventoDetalle'
import type { AgendaEvent, PublicStaffUser } from '@/lib/domain/types'

interface AgendaContexto {
  /** Abre el globo de alta con el día y la hora que sugiere el gesto. */
  crear: (draft: BorradorActividad, anchor: Anchor) => void
  /** Abre el globo de una actividad ya agendada. */
  abrir: (event: AgendaEvent, anchor: Anchor) => void
}

const Contexto = createContext<AgendaContexto | null>(null)

export function useAgenda(): AgendaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAgenda fuera de <AgendaProvider>')
  return ctx
}

/**
 * EL ESTADO COMPARTIDO DE LA AGENDA.
 *
 * Los tres sitios desde los que se agenda —el botón de la barra, una celda del
 * mes, un arrastre sobre la rejilla— abren EL MISMO globo. Por eso el estado no
 * vive en ninguno de ellos sino aquí arriba: si cada uno llevara el suyo, dos
 * globos podrían quedar abiertos a la vez y el formulario de alta acabaría
 * escrito tres veces, que es como empiezan a divergir.
 *
 * El proveedor envuelve la página entera y deja pasar el contenido del servidor
 * tal cual: la rejilla necesita interactividad, pero el panel del día y el
 * bloque de atrasados siguen renderizándose en el servidor.
 */
export function AgendaProvider({
  cases,
  users,
  children,
}: {
  cases: CaseOption[]
  users: PublicStaffUser[]
  children: React.ReactNode
}) {
  const [alta, setAlta] = useState<{ draft: BorradorActividad; anchor: Anchor } | null>(null)
  const [detalle, setDetalle] = useState<{ event: AgendaEvent; anchor: Anchor } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const crear = useCallback((draft: BorradorActividad, anchor: Anchor) => {
    setDetalle(null)
    setAviso(null)
    setAlta({ draft, anchor })
  }, [])

  const abrir = useCallback((event: AgendaEvent, anchor: Anchor) => {
    setAlta(null)
    setDetalle({ event, anchor })
  }, [])

  const cerrarAlta = useCallback(() => setAlta(null), [])
  const cerrarDetalle = useCallback(() => setDetalle(null), [])

  const creada = useCallback((mensaje: string) => {
    setAlta(null)
    setAviso(mensaje)
    window.setTimeout(() => setAviso(null), 4000)
  }, [])

  const valor = useMemo(() => ({ crear, abrir }), [crear, abrir])

  return (
    <Contexto.Provider value={valor}>
      {children}

      {alta ? (
        // La clave cuelga del borrador: abrir el globo en otra hora tiene que
        // traer campos limpios, no los del intento anterior a medio escribir.
        <Popover
          key={`${alta.draft.day}T${alta.draft.startTime}`}
          anchor={alta.anchor}
          onClose={cerrarAlta}
          label="Nueva actividad"
          width={380}
        >
          <NuevaActividadForm
            draft={alta.draft}
            cases={cases}
            users={users}
            onClose={cerrarAlta}
            onCreated={creada}
          />
        </Popover>
      ) : null}

      {detalle ? (
        <Popover
          key={detalle.event.id}
          anchor={detalle.anchor}
          onClose={cerrarDetalle}
          label={detalle.event.title}
          width={340}
        >
          <EventoDetalle event={detalle.event} onClose={cerrarDetalle} />
        </Popover>
      ) : null}

      {/* El globo se cierra al guardar; sin este acuse, la única señal de que la
          actividad existe sería encontrarla uno mismo en la rejilla. */}
      {aviso ? (
        <div
          role="status"
          className="sl-in fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2
            rounded-full bg-sl-text px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          {aviso}
        </div>
      ) : null}
    </Contexto.Provider>
  )
}
