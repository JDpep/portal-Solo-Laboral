import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Inbox className="h-8 w-8 text-sl-muted" aria-hidden />
      <p className="text-sm font-medium text-sl-text">{title}</p>
      {description ? <p className="max-w-sm text-sm text-sl-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

/** Aviso persistente de que la pantalla muestra datos sembrados. */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-sl border border-dashed border-sl-warning/50 bg-sl-warning/5 px-3.5 py-2.5 text-sm leading-relaxed text-sl-text">
      <span className="mt-px shrink-0 rounded-full bg-sl-warning/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sl-warning">
        DEMO
      </span>
      <span>{children}</span>
    </div>
  )
}
