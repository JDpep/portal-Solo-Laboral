import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Envoltura de tabla (brief 59). Scroll horizontal controlado en pantallas
 * chicas y encabezado pegajoso en listados largos.
 */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('sl-card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse">{children}</table>
      </div>
    </div>
  )
}

/** `sticky` solo tiene efecto en listados largos con scroll propio. */
export function THead({ children, sticky = true }: { children: ReactNode; sticky?: boolean }) {
  return (
    <thead
      className={clsx(
        'border-b border-sl-border bg-sl-primary-soft/60',
        sticky && 'sticky top-0 z-10',
      )}
    >
      {children}
    </thead>
  )
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-sl-border">{children}</tbody>
}

export function TR({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  /** Solo para el retardo de la entrada escalonada de la lista. */
  style?: CSSProperties
}) {
  return (
    <tr
      className={clsx('transition-colors duration-150 hover:bg-sl-primary-soft/40', className)}
      style={style}
    >
      {children}
    </tr>
  )
}

export function TH({
  children,
  align = 'left',
  scope = 'col',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  scope?: 'col' | 'row'
}) {
  return (
    <th scope={scope} className={clsx('sl-th', align === 'right' && 'text-right')}>
      {children}
    </th>
  )
}

export function TD({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td className={clsx('sl-td', align === 'right' && 'text-right tabular-nums', className)}>
      {children}
    </td>
  )
}
