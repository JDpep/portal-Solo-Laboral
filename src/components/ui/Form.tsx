'use client'

import { useFormStatus } from 'react-dom'
import { CircleAlert } from 'lucide-react'
import clsx from 'clsx'

/**
 * Botón de envío. Se deshabilita mientras la acción corre: en el formulario
 * público, el doble clic en una conexión lenta es la causa número uno de
 * envíos repetidos (el servidor los detecta igual, pero mejor no provocarlos).
 */
export function SubmitButton({
  children,
  variant = 'primary',
  size = 'md',
  disabled,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg'
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={clsx(
        variant === 'primary' ? 'sl-btn-primary' : 'sl-btn-secondary',
        size === 'lg' && 'sl-btn-lg',
      )}
    >
      {pending ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden
        />
      ) : null}
      {pending ? 'Enviando…' : children}
    </button>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="sl-in flex items-start gap-2 rounded-sl border border-sl-danger/30 bg-sl-danger/5 px-3 py-2.5 text-sm text-sl-danger"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}
