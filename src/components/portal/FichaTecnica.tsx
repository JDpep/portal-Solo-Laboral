import clsx from 'clsx'

/**
 * FICHA TÉCNICA — la rejilla de datos de un caso.
 *
 * Etiqueta arriba, dato abajo, en columnas. No es un capricho de maquetación:
 * en una lista de pares "etiqueta: valor" en vertical, el ojo tiene que
 * recorrer toda la altura para encontrar la fecha de despido. En rejilla, los
 * dieciséis datos del caso caben en un golpe de vista y la posición de cada uno
 * se memoriza — a la tercera ficha ya se sabe dónde mirar.
 *
 * El dato manda sobre la etiqueta: la etiqueta va pequeña y en gris, el valor
 * en el tamaño del texto normal. Quien abre esto ya sabe qué está buscando.
 */
export function Ficha({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden bg-sl-border sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </dl>
  )
}

export function Dato({
  label,
  children,
  /** Para el dato largo —una entidad, un nombre— que no cabe en una celda. */
  wide = false,
  mono = false,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
  mono?: boolean
}) {
  return (
    <div
      className={clsx(
        'bg-sl-surface px-4 py-3',
        wide && 'col-span-2',
      )}
    >
      <dt className="sl-eyebrow">{label}</dt>
      <dd
        className={clsx(
          'mt-1 text-sm text-sl-text',
          mono && 'font-mono font-semibold text-sl-primary',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/** Un hueco se dice, no se deja en blanco: en blanco parece un error de carga. */
export function SinDato({ children = 'No registrado' }: { children?: React.ReactNode }) {
  return <span className="text-sl-muted">{children}</span>
}
