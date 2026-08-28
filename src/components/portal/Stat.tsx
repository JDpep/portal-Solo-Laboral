import clsx from 'clsx'

/**
 * UN INDICADOR.
 *
 * Número grande, etiqueta pequeña encima y una línea de contexto debajo. La
 * línea de abajo no es decoración: un "14" sin nada al lado no se puede
 * interpretar —¿de cuántos?, ¿desde cuándo?—, y un indicador que hay que ir a
 * calcular a otra pantalla no es un indicador.
 *
 * Los números van en tabular para que dos indicadores contiguos alineen sus
 * dígitos y se puedan comparar de un vistazo.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'neutral' | 'success' | 'muted'
}) {
  return (
    <div className="sl-card px-4 py-3.5">
      <p className="sl-eyebrow">{label}</p>
      <p
        className={clsx(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'success' && 'text-sl-success',
          tone === 'muted' && 'text-sl-muted',
          tone === 'neutral' && 'text-sl-text',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-sl-muted">{hint}</p> : null}
    </div>
  )
}

/**
 * Una barra de reparto con su cifra.
 *
 * La proporción se dice DOS veces —barra y número— a propósito: la barra deja
 * comparar cinco motivos de un golpe, y el número es el que se copia a un
 * correo. Quien no distingue longitudes tiene el dato escrito.
 */
export function Bar({
  label,
  value,
  total,
  href,
  active = false,
}: {
  label: React.ReactNode
  value: number
  total: number
  href?: string
  active?: boolean
}) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)
  const inner = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className={clsx('text-sm', active ? 'font-semibold text-sl-text' : 'text-sl-text')}>
          {label}
        </span>
        <span className="whitespace-nowrap text-xs tabular-nums text-sl-muted">
          {value} · {percent}%
        </span>
      </span>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-sl-primary-soft">
        <span
          className={clsx('block h-full', active ? 'bg-sl-primary' : 'bg-sl-secondary')}
          style={{ width: `${percent}%` }}
        />
      </span>
    </>
  )

  if (!href) return <div className="block">{inner}</div>
  return (
    <a
      href={href}
      className={clsx(
        'block rounded-sl px-2 py-1.5 transition-colors -mx-2 hover:bg-sl-background',
        active && 'bg-sl-primary-soft/60',
      )}
    >
      {inner}
    </a>
  )
}
