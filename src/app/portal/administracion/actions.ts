'use server'

/**
 * ACCIONES DE ADMINISTRACIÓN.
 *
 * TODAS empiezan por `requireAdmin()`, y eso no es ceremonia: es el permiso. Que
 * el enlace de Administración no se pinte para un abogado no protege nada —quien
 * mande el POST a mano tiene que chocar contra esta misma pared—, y aquí se
 * dan de alta cuentas con acceso a datos personales de prospectos.
 *
 * DOS CANDADOS que no se pueden quitar desde la pantalla, porque quitarlos deja
 * al despacho fuera de su propio portal:
 *
 *   · nadie se da de baja a sí mismo ni se quita su propio rol de admin;
 *   · nunca puede quedar cero administradores activos.
 *
 * Volver a entrar después de eso exigiría abrir la terminal, que es exactamente
 * lo que esta pantalla viene a evitar.
 */
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guard'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import {
  countActiveAdmins,
  createUser,
  emailTaken,
  findUserById,
  setUserPassword,
  setUserStatus,
  updateUser,
} from '@/lib/db/users'
import {
  createTemplateItem,
  moveTemplateItem,
  setTemplateItemActive,
  updateTemplateItem,
} from '@/lib/db/checklist'
import type { StaffRole } from '@/lib/domain/types'

const ROLES: StaffRole[] = ['admin', 'lawyer']

/** Suficiente para descartar lo que no es un correo, sin pelearse con el RFC. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface AdminState {
  error?: string
  ok?: string
}

function refresh() {
  revalidatePath('/portal/administracion')
}

// ────────────────────────────────────────────────────────────────── cuentas

/**
 * ALTA DE CUENTA.
 *
 * No hay registro público ni invitación por correo: la cuenta la crea un
 * administrador y le dicta la contraseña a su dueño, que la cambia después. Un
 * flujo por correo exigiría un servicio de envío del que hoy no depende nada, y
 * un enlace de alta que caduca mal es una puerta abierta a los expedientes.
 */
export async function createUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const email = String(formData.get('email') ?? '').trim().slice(0, 160)
  const role = String(formData.get('role') ?? '') as StaffRole
  const password = String(formData.get('password') ?? '')

  if (!name) return { error: 'Escribe el nombre de la persona.' }
  if (!EMAIL_RE.test(email)) return { error: 'Ese correo no parece válido.' }
  if (!ROLES.includes(role)) return { error: 'Elige un rol.' }

  const weak = validatePasswordStrength(password)
  if (weak) return { error: weak }

  // Se comprueba antes para poder explicarlo; el UNIQUE de la base es quien de
  // verdad lo impide si dos altas llegan a la vez.
  if (await emailTaken(email)) {
    return { error: 'Ya hay una cuenta con ese correo.' }
  }

  try {
    const created = await createUser({
      name,
      email,
      role,
      passwordHash: await hashPassword(password),
    })
    await setUserStatus(created.id, 'active', admin.id)
    refresh()
    return { ok: `Cuenta creada para ${created.name}. Dile su contraseña en persona.` }
  } catch {
    return { error: 'No se pudo crear la cuenta. Revisa el correo e inténtalo de nuevo.' }
  }
}

export async function updateUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const userId = String(formData.get('userId') ?? '')
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const email = String(formData.get('email') ?? '').trim().slice(0, 160)
  const role = String(formData.get('role') ?? '') as StaffRole

  if (!name) return { error: 'El nombre no puede quedar vacío.' }
  if (!EMAIL_RE.test(email)) return { error: 'Ese correo no parece válido.' }
  if (!ROLES.includes(role)) return { error: 'Elige un rol.' }

  const target = await findUserById(userId)
  if (!target) return { error: 'No encontramos esa cuenta.' }

  if (await emailTaken(email, userId)) return { error: 'Ya hay otra cuenta con ese correo.' }

  // Quitarse a uno mismo el rol de admin es la forma más fácil de quedarse
  // fuera sin darse cuenta: el botón desaparece en la misma recarga.
  if (userId === admin.id && role !== 'admin') {
    return { error: 'No puedes quitarte a ti mismo el rol de administrador.' }
  }
  if (
    target.role === 'admin' &&
    role !== 'admin' &&
    target.status === 'active' &&
    (await countActiveAdmins()) <= 1
  ) {
    return { error: 'Es el único administrador activo. Nombra a otro antes de cambiarle el rol.' }
  }

  await updateUser(userId, { name, email, role }, admin.id)
  refresh()
  return { ok: 'Cuenta actualizada.' }
}

/** Alta o baja. Una baja surte efecto de inmediato: la sesión relee el estado. */
export async function setUserStatusAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const userId = String(formData.get('userId') ?? '')
  const status = String(formData.get('status') ?? '') === 'inactive' ? 'inactive' : 'active'

  const target = await findUserById(userId)
  if (!target) return { error: 'No encontramos esa cuenta.' }

  if (status === 'inactive') {
    if (userId === admin.id) {
      return { error: 'No puedes darte de baja a ti mismo.' }
    }
    if (target.role === 'admin' && target.status === 'active' && (await countActiveAdmins()) <= 1) {
      return { error: 'Es el único administrador activo. El portal se quedaría sin administración.' }
    }
  }

  await setUserStatus(userId, status, admin.id)
  refresh()
  return {
    ok:
      status === 'inactive'
        ? `${target.name} ya no puede entrar. La cuenta se conserva con todo lo que hizo.`
        : `${target.name} vuelve a tener acceso.`,
  }
}

/**
 * Poner una contraseña nueva a una cuenta.
 *
 * El administrador la elige y se la dicta. NO se muestra después en ninguna
 * pantalla ni se guarda en claro: la bitácora anota que se cambió y quién la
 * cambió, jamás cuál es.
 */
export async function setPasswordAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')

  const target = await findUserById(userId)
  if (!target) return { error: 'No encontramos esa cuenta.' }

  const weak = validatePasswordStrength(password)
  if (weak) return { error: weak }

  await setUserPassword(userId, await hashPassword(password), admin.id)
  refresh()
  return { ok: `Contraseña nueva para ${target.name}. Dísela en persona; no vuelve a mostrarse.` }
}

// ────────────────────────────────────────────────────────────────── plantilla

export async function addTemplateItemAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const templateId = String(formData.get('templateId') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 200)
  const description = String(formData.get('description') ?? '').trim().slice(0, 500)

  if (!title) return { error: 'Escribe el título del paso.' }

  const created = await createTemplateItem(templateId, { title, description }, admin.id)
  if (!created) return { error: 'No encontramos esa plantilla.' }
  refresh()
  return { ok: `Paso «${created.title}» añadido al final. Solo entra en los casos nuevos.` }
}

export async function updateTemplateItemAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const itemId = String(formData.get('itemId') ?? '')
  const title = String(formData.get('title') ?? '').trim().slice(0, 200)
  const description = String(formData.get('description') ?? '').trim().slice(0, 500)

  if (!title) return { error: 'El título no puede quedar vacío.' }

  const updated = await updateTemplateItem(itemId, { title, description }, admin.id)
  if (!updated) return { error: 'No encontramos ese paso.' }
  refresh()
  return { ok: 'Paso actualizado. Los casos que ya lo llevan conservan su texto.' }
}

/**
 * Retirar o reponer un paso.
 *
 * Retirar NO borra: el paso sigue entero en los casos que ya lo llevaban. La
 * base rechaza retirar el último vigente, porque una plantilla vacía produce
 * casos sin ruta que nadie puede avanzar y que no avisan de nada.
 */
export async function setTemplateItemActiveAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin()
  const itemId = String(formData.get('itemId') ?? '')
  const active = String(formData.get('active') ?? '') === 'si'

  const result = await setTemplateItemActive(itemId, active, admin.id)
  if (!result.ok) {
    return {
      error:
        result.code === 'last_one'
          ? 'Es el único paso vigente. Una plantilla sin pasos crearía casos sin ruta.'
          : 'No encontramos ese paso.',
    }
  }
  refresh()
  return {
    ok: active
      ? `«${result.item.title}» vuelve a entrar en los casos nuevos.`
      : `«${result.item.title}» ya no entra en los casos nuevos. Los que lo llevan lo conservan.`,
  }
}

export async function moveTemplateItemAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const itemId = String(formData.get('itemId') ?? '')
  const direction = String(formData.get('direction') ?? '') === 'up' ? 'up' : 'down'

  await moveTemplateItem(itemId, direction, admin.id)
  refresh()
}
