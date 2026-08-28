/**
 * Esqueleto de "Casos por contactar".
 *
 * Tiene la MISMA forma que la lista real —mismas alturas, mismo número de
 * columnas, mismas tarjetas en móvil— para que al llegar el contenido nada se
 * recoloque. Un esqueleto genérico ahorra la espera pero provoca el salto, que
 * es lo que de verdad se percibe como lentitud.
 */
export default function LoadingPortal() {
  const rows = Array.from({ length: 5 })

  return (
    <div className="sl-in-fade">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="sl-skeleton h-6 w-56" />
          <div className="sl-skeleton mt-2 h-4 w-72 max-w-full" />
        </div>
        <div className="sl-skeleton h-11 w-11 rounded-sl sm:w-32" />
      </div>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:justify-between">
        <div className="sl-skeleton h-11 w-full rounded-sl sm:h-10 sm:w-72" />
        <div className="sl-skeleton h-11 w-full rounded-sl sm:hidden" />
      </div>

      {/* Teléfono */}
      <ul className="space-y-3 sm:hidden">
        {rows.map((_, i) => (
          <li key={i} className="sl-card overflow-hidden">
            <div className="p-4">
              <div className="sl-skeleton h-3 w-24" />
              <div className="sl-skeleton mt-2 h-5 w-48 max-w-full" />
              <div className="sl-skeleton mt-2.5 h-4 w-40" />
              <div className="sl-skeleton mt-2 h-4 w-52 max-w-full" />
            </div>
            <div className="border-t border-sl-border bg-sl-primary-soft/30 p-3">
              <div className="sl-skeleton h-11 w-full rounded-sl" />
            </div>
          </li>
        ))}
      </ul>

      {/* Escritorio */}
      <div className="sl-card hidden overflow-hidden sm:block">
        <div className="flex gap-6 border-b border-sl-border bg-sl-primary-soft/60 px-4 py-3">
          {['w-24', 'w-16', 'w-24', 'w-20', 'w-24'].map((w) => (
            <div key={w} className={`sl-skeleton h-3 ${w}`} />
          ))}
        </div>
        {rows.map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-sl-border px-4 py-4">
            <div className="sl-skeleton h-4 w-44" />
            <div className="sl-skeleton h-4 w-24" />
            <div className="sl-skeleton h-4 w-28" />
            <div className="sl-skeleton h-4 w-32" />
            <div className="sl-skeleton ml-auto h-4 w-20" />
          </div>
        ))}
        <div className="px-4 py-3">
          <div className="sl-skeleton h-3 w-24" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Cargando los casos por contactar
      </span>
    </div>
  )
}
