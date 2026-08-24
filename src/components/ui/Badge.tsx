import clsx from 'clsx'
import { PhoneCall } from 'lucide-react'
import { formatDateChip } from '@/lib/dates'
import { CALL_SLOT_SHORT } from '@/lib/domain/call-slot'
import type { CallPreference } from '@/lib/domain/call-slot'

const base =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap'

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'primary' | 'info' | 'success' | 'warning'
  className?: string
}) {
  return (
    <span
      className={clsx(
        base,
        tone === 'neutral' && 'bg-sl-primary-soft text-sl-primary',
        tone === 'primary' && 'bg-sl-primary/10 text-sl-primary',
        tone === 'info' && 'bg-sl-secondary/10 text-sl-secondary-strong',
        tone === 'success' && 'bg-sl-success/10 text-sl-success',
        tone === 'warning' && 'bg-sl-warning/10 text-sl-warning',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Antigüedad del despido al momento del envío.
 *
 * El tono NO es un semáforo de calidad del caso: los tres son casos
 * calificados. Marca urgencia de contacto — a mayor antigüedad, menos margen
 * queda antes de que el asunto salga del criterio del despacho.
 */
export function DaysBadge({ days, compact = false }: { days: number; compact?: boolean }) {
  const tone = days <= 15 ? 'success' : days <= 40 ? 'info' : 'warning'
  return (
    <Badge tone={tone} className="tabular-nums">
      {compact ? `${days} d` : `${days} ${days === 1 ? 'día' : 'días'}`}
    </Badge>
  )
}

/**
 * Franja que la persona pidió para su llamada.
 *
 * Va junto al nombre y no en una columna aparte: es un dato DE esa persona y
 * el abogado lo necesita en el mismo golpe de vista con el que decide a quién
 * marca ahora. Una séptima columna lo habría escondido en el scroll horizontal
 * justo en el aparato desde el que se llama.
 */
export function CallSlotBadge({
  preference,
  className,
}: {
  preference: CallPreference
  className?: string
}) {
  return (
    <Badge tone="info" className={clsx('gap-1', className)}>
      <PhoneCall className="h-3 w-3 shrink-0" aria-hidden />
      Pidió {formatDateChip(preference.date)} · {CALL_SLOT_SHORT[preference.slot]}
    </Badge>
  )
}

/** Marca de dato sembrado: ningún registro ficticio puede pasar por real. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title="Registro de demostración. No corresponde a una solicitud real."
      className={clsx(
        base,
        'border border-dashed border-sl-warning/60 bg-sl-warning/10 text-sl-warning',
        className,
      )}
    >
      DEMO
    </span>
  )
}
