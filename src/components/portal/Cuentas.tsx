'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { CircleCheck, KeyRound, Pencil, UserPlus } from 'lucide-react'
import {
  createUserAction,
  setPasswordAction,
  setUserStatusAction,
  updateUserAction,
} from '@/app/portal/administracion/actions'
import type { AdminState } from '@/app/portal/administracion/actions'
import { FormError, SubmitButton } from '@/components/ui/Form'
import { Badge } from '@/components/ui/Badge'
import { ROLE_LABEL } from '@/lib/domain/labels'
import { formatDateTime } from '@/lib/dates'
import type { PublicStaffUser, StaffRole } from '@/lib/domain/types'

const ROLES: StaffRole[] = ['lawyer', 'admin']

/** El acuse de una acción que salió bien. Sin él, guardar no se distingue de no hacer nada. */
function Ok({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      role="status"
      className="sl-in flex items-start gap-2 rounded-sl border border-sl-success/30 bg-sl-success/5 px-3 py-2.5 text-sm text-sl-success"
    >
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

/**
 * CUENTAS DEL DESPACHO.
 *
 * No hay registro público ni invitación por correo: la cuenta la crea un
 * administrador y le dicta la contraseña a su dueño. Un enlace de alta enviado
 * por correo es una puerta a los expedientes que vive en una bandeja de
 * entrada, y el despacho no tiene hoy servicio de envío del que dependa nada.
 *
 * Y NO SE BORRA NADIE. Una cuenta se da de baja: borrarla se llevaría consigo
 * la autoría de todo lo que esa persona hizo, y la bitácora dejaría de poder
 * reconstruir qué pasó con un caso.
 */
export function Cuentas({ users, currentUserId }: { users: PublicStaffUser[]; currentUserId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useFormState<AdminState, FormData>(createUserAction, {})

  const activos = users.filter((user) => user.status === 'active')
  const admins = activos.filter((user) => user.role === 'admin')

  return (
    <section className="sl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border px-5 py-3.5">
        <div>
          <h2 className="sl-eyebrow">Cuentas del despacho</h2>
          <p className="mt-0.5 text-xs text-sl-muted">
            {activos.length} {activos.length === 1 ? 'activa' : 'activas'} · {admins.length}{' '}
            {admins.length === 1 ? 'administrador' : 'administradores'}
          </p>
        </div>
        {open ? null : (
          <button type="button" onClick={() => setOpen(true)} className="sl-btn-secondary">
            <UserPlus className="h-4 w-4" aria-hidden />
            Crear cuenta
          </button>
        )}
      </div>

      {open ? (
        <form action={formAction} className="space-y-3 border-b border-sl-border bg-sl-background px-5 py-4">
          <h3 className="text-sm font-semibold text-sl-text">Cuenta nueva</h3>
          <FormError message={state.error} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nuevo-nombre" className="sl-label">Nombre</label>
              <input id="nuevo-nombre" name="name" required maxLength={120} className="sl-input" />
            </div>
            <div>
              <label htmlFor="nuevo-correo" className="sl-label">Correo</label>
              <input
                id="nuevo-correo"
                name="email"
                type="email"
                required
                maxLength={160}
                className="sl-input"
                placeholder="nombre@SL.mx"
              />
            </div>
            <div>
              <label htmlFor="nuevo-rol" className="sl-label">Rol</label>
              <select id="nuevo-rol" name="role" defaultValue="lawyer" className="sl-input">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nueva-clave" className="sl-label">Contraseña</label>
              <input
                id="nueva-clave"
                name="password"
                type="text"
                required
                className="sl-input font-mono"
                autoComplete="off"
              />
              {/* En texto plano a propósito: quien la crea tiene que poder
                  leerla para dictarla, y esconderla solo provoca erratas que
                  acaban en un "no puedo entrar" media hora después. */}
              <p className="mt-1 text-xs text-sl-muted">
                Mínimo 10 caracteres, con minúscula, mayúscula y número. Se dicta en persona: no
                vuelve a mostrarse.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>Crear cuenta</SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="sl-btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {state.ok ? <div className="px-5 pt-4">
        <Ok message={state.ok} />
      </div> : null}

      <ul className="divide-y divide-sl-border">
        {users.map((user) => (
          <Cuenta key={user.id} user={user} isSelf={user.id === currentUserId} />
        ))}
      </ul>

      <p className="border-t border-sl-border bg-sl-background px-5 py-3 text-xs text-sl-muted">
        Una cuenta no se borra: se da de baja. Borrarla se llevaría consigo la autoría de todo lo
        que esa persona hizo, y la bitácora dejaría de poder reconstruir qué pasó con un caso.
      </p>
    </section>
  )
}

function Cuenta({ user, isSelf }: { user: PublicStaffUser; isSelf: boolean }) {
  const [edit, updateAction] = useFormState<AdminState, FormData>(updateUserAction, {})
  const [pass, passAction] = useFormState<AdminState, FormData>(setPasswordAction, {})
  const [status, statusAction] = useFormState<AdminState, FormData>(setUserStatusAction, {})
  const inactive = user.status === 'inactive'

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-sl-text">
            {user.name}
            <Badge tone={user.role === 'admin' ? 'primary' : 'neutral'}>
              {ROLE_LABEL[user.role]}
            </Badge>
            {inactive ? <Badge tone="warning">Dada de baja</Badge> : null}
            {isSelf ? <span className="text-xs font-normal text-sl-muted">(tu cuenta)</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-sl-muted">{user.email}</p>
          <p className="mt-0.5 text-xs text-sl-muted">
            {user.lastLoginAt
              ? `Última entrada ${formatDateTime(user.lastLoginAt)}`
              : 'Todavía no ha entrado'}
          </p>
        </div>

        {/* La baja no se ofrece sobre la propia cuenta: el servidor lo rechaza
            igual, pero enseñar un botón que siempre falla es una trampa. */}
        {isSelf ? null : (
          <form action={statusAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="status" value={inactive ? 'active' : 'inactive'} />
            <SubmitButton variant="secondary">{inactive ? 'Reactivar' : 'Dar de baja'}</SubmitButton>
          </form>
        )}
      </div>

      <FormError message={status.error} />
      <Ok message={status.ok} />

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-sl-primary hover:underline">
          <span className="inline-flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar datos y contraseña
          </span>
        </summary>

        <form action={updateAction} className="mt-3 space-y-2 rounded-sl bg-sl-background p-3">
          <FormError message={edit.error} />
          <Ok message={edit.ok} />
          <input type="hidden" name="userId" value={user.id} />
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label htmlFor={`n-${user.id}`} className="sl-label text-xs">Nombre</label>
              <input
                id={`n-${user.id}`}
                name="name"
                defaultValue={user.name}
                maxLength={120}
                className="sl-input text-sm"
              />
            </div>
            <div>
              <label htmlFor={`e-${user.id}`} className="sl-label text-xs">Correo</label>
              <input
                id={`e-${user.id}`}
                name="email"
                type="email"
                defaultValue={user.email}
                maxLength={160}
                className="sl-input text-sm"
              />
            </div>
            <div>
              <label htmlFor={`r-${user.id}`} className="sl-label text-xs">Rol</label>
              <select
                id={`r-${user.id}`}
                name="role"
                defaultValue={user.role}
                className="sl-input text-sm"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SubmitButton variant="secondary">Guardar</SubmitButton>
        </form>

        <form action={passAction} className="mt-2 space-y-2 rounded-sl bg-sl-background p-3">
          <FormError message={pass.error} />
          <Ok message={pass.ok} />
          <input type="hidden" name="userId" value={user.id} />
          <label htmlFor={`p-${user.id}`} className="sl-label text-xs">
            Contraseña nueva
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`p-${user.id}`}
              name="password"
              type="text"
              required
              autoComplete="off"
              placeholder="Mínimo 10, con mayúscula y número"
              className="sl-input w-auto flex-1 font-mono text-sm"
            />
            <SubmitButton variant="secondary">
              <KeyRound className="h-4 w-4" aria-hidden />
              Cambiar
            </SubmitButton>
          </div>
        </form>
      </details>
    </li>
  )
}
