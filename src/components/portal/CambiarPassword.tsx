'use client'

import { useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'
import { CircleCheck, KeyRound } from 'lucide-react'
import { cambiarPasswordAction } from '@/app/portal/cuenta/actions'
import type { PasswordState } from '@/app/portal/cuenta/actions'
import { FormError, SubmitButton } from '@/components/ui/Form'

/**
 * CAMBIAR LA CONTRASEÑA.
 *
 * Los tres campos llevan `autoComplete` de verdad —`current-password` y
 * `new-password`— para que el gestor de contraseñas del navegador ofrezca la
 * guardada y proponga una nueva. Sin eso, la gente escribe a mano y acaba
 * eligiendo algo que ya usa en otro sitio.
 *
 * Los requisitos se dicen ANTES de escribir, no después de fallar. Enterarse de
 * que faltaba una mayúscula cuando ya se envió el formulario obliga a rehacerlo
 * entero, normalmente con una contraseña peor.
 */
export function CambiarPassword() {
  const [state, formAction] = useFormState<PasswordState, FormData>(cambiarPasswordAction, {})
  const form = useRef<HTMLFormElement>(null)

  // Los campos se vacían al lograrlo: dejar la contraseña nueva escrita en
  // pantalla es exactamente lo que no se quiere en una sala compartida.
  useEffect(() => {
    if (state.ok) form.current?.reset()
  }, [state.ok])

  return (
    <form ref={form} action={formAction} className="sl-card max-w-md space-y-3 p-5">
      <FormError message={state.error} />

      {state.ok ? (
        <p role="status" className="sl-in flex items-start gap-2 text-sm text-sl-success">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      ) : null}

      <div>
        <label htmlFor="pw-actual" className="sl-label">Contraseña actual</label>
        <input
          id="pw-actual"
          name="actual"
          type="password"
          required
          autoComplete="current-password"
          className="sl-input"
        />
      </div>

      <div>
        <label htmlFor="pw-nueva" className="sl-label">Contraseña nueva</label>
        <input
          id="pw-nueva"
          name="nueva"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="sl-input"
          aria-describedby="pw-requisitos"
        />
        <p id="pw-requisitos" className="sl-hint">
          Al menos 10 caracteres, con una minúscula, una mayúscula y un número.
        </p>
      </div>

      <div>
        <label htmlFor="pw-confirmacion" className="sl-label">Repite la nueva</label>
        <input
          id="pw-confirmacion"
          name="confirmacion"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="sl-input"
        />
      </div>

      <SubmitButton>
        <KeyRound className="h-4 w-4" aria-hidden />
        Cambiar contraseña
      </SubmitButton>
    </form>
  )
}
