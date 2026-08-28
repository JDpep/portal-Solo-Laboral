/** Esqueleto del detalle del caso, con la misma forma que la ficha real. */
export default function LoadingCase() {
  return (
    <div className="sl-in-fade mx-auto max-w-3xl">
      <div className="sl-skeleton mb-4 h-4 w-40" />

      <div className="sl-card overflow-hidden">
        <div className="border-b border-sl-border bg-sl-primary-soft/50 px-5 py-5 sm:px-7">
          <div className="sl-skeleton h-3.5 w-24" />
          <div className="sl-skeleton mt-2 h-7 w-64 max-w-full" />
          <div className="sl-skeleton mt-2 h-4 w-52 max-w-full" />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="sl-skeleton h-11 w-full rounded-sl sm:w-56" />
            <div className="sl-skeleton h-11 w-full rounded-sl sm:w-36" />
          </div>
        </div>

        <div className="border-b border-sl-border px-5 py-5 sm:px-7">
          <div className="sl-skeleton h-3 w-32" />
          <div className="sl-skeleton mt-3 h-4 w-full" />
          <div className="sl-skeleton mt-2 h-4 w-11/12" />
          <div className="sl-skeleton mt-2 h-4 w-2/3" />
        </div>

        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-sl-border px-5 py-4 last:border-b-0 sm:px-7">
            <div className="sl-skeleton h-3 w-28" />
            <div className="sl-skeleton mt-2 h-4 w-40" />
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Cargando el caso
      </span>
    </div>
  )
}
