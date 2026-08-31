import Link from 'next/link'
import clsx from 'clsx'
import type { PlainDate } from '@/lib/dates'

export type VistaAgenda = 'mes' | 'semana' | 'dia'

export const VISTAS: { valor: VistaAgenda; etiqueta: string }[] = [
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'dia', etiqueta: 'Día' },
]

export function esVista(valor: unknown): valor is VistaAgenda {
  return valor === 'mes' || valor === 'semana' || valor === 'dia'
}

/**
 * MES / SEMANA / DÍA.
 *
 * Va como enlaces y no como botones de estado: la vista y el día viajan en la
 * dirección, así que un calendario abierto en una semana concreta se puede
 * guardar en favoritos, mandar por chat o recargar sin perderse. El día elegido
 * se arrastra al cambiar de vista —pasar de la semana al día tiene que caer en
 * el día que se estaba mirando, no en hoy.
 */
export function VistaSwitch({ vista, dia }: { vista: VistaAgenda; dia: PlainDate }) {
  return (
    <div
      role="group"
      aria-label="Cómo ver el calendario"
      className="inline-flex rounded-sl border border-sl-border bg-sl-surface p-0.5"
    >
      {VISTAS.map(({ valor, etiqueta }) => (
        <Link
          key={valor}
          href={`/portal/calendario?vista=${valor}&dia=${dia}`}
          scroll={false}
          aria-current={vista === valor ? 'page' : undefined}
          className={clsx(
            'rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors',
            vista === valor
              ? 'bg-sl-primary text-white'
              : 'text-sl-muted hover:bg-sl-primary-soft hover:text-sl-text',
          )}
        >
          {etiqueta}
        </Link>
      ))}
    </div>
  )
}
