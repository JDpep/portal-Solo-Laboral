/**
 * Progreso de la ruta: "3 de 7" con su barra.
 *
 * El número va SIEMPRE junto a la barra. Una barra sola dice "va por la mitad"
 * pero no cuántos pasos faltan, que es lo que el abogado necesita para decidir
 * si el caso está cerca de cerrarse o no ha arrancado.
 *
 * Los pasos marcados "no aplica" no cuentan en el total: si contaran, un caso
 * donde tres no aplican no llegaría nunca al 100 % y el número dejaría de
 * significar algo.
 */
export function Progress({ completed, total }: { completed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  const done = total > 0 && completed === total

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-sl-primary-soft"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${completed} de ${total} pasos completados`}
      >
        <div
          className={done ? 'h-full bg-sl-success' : 'h-full bg-sl-primary'}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-sl-muted">
        {completed}/{total}
      </span>
    </div>
  )
}
