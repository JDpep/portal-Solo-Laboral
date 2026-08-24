'use client'

import { useFormState } from 'react-dom'
import { loginAction } from '@/app/acceso/actions'
import type { LoginState } from '@/app/acceso/actions'
import { TextField } from '@/components/ui/Field'
import { FormError, SubmitButton } from '@/components/ui/Form'

const INITIAL_STATE: LoginState = {}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, INITIAL_STATE)

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="username"
        required
        placeholder="nombre@sololaboral.mx"
      />
      <TextField
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton size="lg">Entrar</SubmitButton>
    </form>
  )
}
