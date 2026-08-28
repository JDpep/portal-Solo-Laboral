import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from './helpers'
import { db, transaction } from '@/lib/db/sql'
import { createLead } from '@/lib/db/leads'
import { convertLeadToCase } from '@/lib/db/cases'
import {
  createTemplateItem,
  findDefaultTemplate,
  listChecklist,
  listTemplates,
  moveTemplateItem,
  setTemplateItemActive,
  updateTemplateItem,
} from '@/lib/db/checklist'
import {
  countActiveAdmins,
  createUser,
  emailTaken,
  findUserByEmail,
  listAllUsers,
  setUserPassword,
  setUserStatus,
  updateUser,
} from '@/lib/db/users'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { listAuditForEntity } from '@/lib/db/audit'
import { qualifyLead } from '@/lib/domain/qualification'
import { addDays, today } from '@/lib/dates'

/**
 * ADMINISTRACIÓN.
 *
 * Lo que se prueba aquí es sobre todo lo que NO se puede hacer. Una pantalla de
 * administración es la que puede dejar al despacho fuera de su propio portal o
 * romper los casos en curso, y esas dos cosas las tiene que impedir la base —no
 * un `if` en un componente que mañana alguien reordena.
 *
 * ESTE ARCHIVO ES EL ÚNICO QUE MODIFICA LA PLANTILLA, y `resetDb` no la toca a
 * propósito: para el resto de la suite es configuración, no datos de prueba. Así
 * que se guarda una copia antes de empezar y se restituye después de CADA
 * prueba. Sin eso, un paso retirado aquí se filtraría al siguiente archivo y
 * haría fallar pruebas que no tienen nada que ver con esto — que es exactamente
 * lo que pasó la primera vez que se corrieron.
 */
let n = 0

interface PasoOriginal {
  id: string
  title: string
  description: string
  position: number
  isActive: boolean
}

let plantillaId = ''
let plantillaOriginal: PasoOriginal[] = []

beforeAll(async () => {
  const rows = await db()`SELECT * FROM case_checklist_template_items ORDER BY position`
  plantillaId = rows[0].template_id
  plantillaOriginal = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    position: row.position,
    isActive: row.is_active,
  }))
})

/**
 * Deja la plantilla exactamente como la sembró la migración.
 *
 * En UNA transacción porque el trigger que exige al menos un paso vigente es
 * DEFERRABLE: dentro de la transacción se puede quedar vacía un instante, y al
 * confirmar ya vuelve a tener los ocho. Statement a statement, el borrado del
 * último paso reventaría.
 *
 * Se reinsertan con el MISMO id: es la referencia con la que los casos
 * emparejan sus pasos, y cambiarla sería otra forma de romper lo que se está
 * probando que no se rompe.
 */
async function restaurarPlantilla() {
  await transaction(async () => {
    const sql = db()
    await sql`DELETE FROM case_checklist_template_items WHERE template_id = ${plantillaId}::uuid`
    for (const paso of plantillaOriginal) {
      await sql`
        INSERT INTO case_checklist_template_items
          (id, template_id, title, description, position, is_active)
        VALUES (${paso.id}::uuid, ${plantillaId}::uuid, ${paso.title}, ${paso.description},
                ${paso.position}, ${paso.isActive})
      `
    }
  })
}

/** Primero se vacían los casos: la clave ajena impide borrar un paso en uso. */
afterEach(async () => {
  await resetDb()
  await restaurarPlantilla()
})

async function crearUsuario(role: 'admin' | 'lawyer' = 'lawyer', name?: string) {
  n += 1
  return createUser({
    name: name ?? `Persona ${n}`,
    email: `persona${n}@sl.mx`,
    role,
    passwordHash: await hashPassword('SoloLaboral26'),
  })
}

async function crearCasoConRuta(userId: string) {
  n += 1
  const hoy = today()
  const dismissalDate = addDays(hoy, -20)
  const verdict = qualifyLead({ state: 'CMX', dismissalDate, submittedOn: hoy })
  const lead = await createLead({
    fullName: `Cliente ${n}`,
    phone: `55000000${String(n).padStart(2, '0')}`,
    state: 'CMX',
    dismissalDate,
    description: '',
    submittedOn: hoy,
    qualificationStatus: verdict.status,
    qualificationReason: verdict.reason,
    dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
  })
  const result = await convertLeadToCase(lead.id, userId)
  if (!result.ok) throw new Error(result.code)
  return result.caseId
}

describe('cuentas', () => {
  beforeEach(async () => {
    await resetDb()
    n = 0
  })

  it('el correo es único sin importar mayúsculas', async () => {
    await crearUsuario('lawyer')
    // citext: la base compara sin distinguir caja, así que "Persona1@SL.mx" y
    // "persona1@sl.mx" son la misma cuenta y no dos puertas al mismo portal.
    expect(await emailTaken('PERSONA1@SL.MX')).toBe(true)
    expect(await emailTaken('otra@sl.mx')).toBe(false)
  })

  it('el correo propio no cuenta como ocupado al editarse a sí mismo', async () => {
    const user = await crearUsuario('lawyer')
    expect(await emailTaken(user.email, user.id)).toBe(false)
    expect(await emailTaken(user.email)).toBe(true)
  })

  it('cuenta los administradores ACTIVOS, no todos', async () => {
    const uno = await crearUsuario('admin')
    await crearUsuario('admin')
    await crearUsuario('lawyer')
    expect(await countActiveAdmins()).toBe(2)

    await setUserStatus(uno.id, 'inactive')
    // Es el número que decide si se puede dar de baja a alguien: un admin
    // inactivo no puede administrar nada, así que no cuenta.
    expect(await countActiveAdmins()).toBe(1)
  })

  it('un abogado con rol de admin cuenta en cuanto se le cambia el rol', async () => {
    const admin = await crearUsuario('admin')
    const abogada = await crearUsuario('lawyer')
    expect(await countActiveAdmins()).toBe(1)

    await updateUser(abogada.id, { role: 'admin' }, admin.id)
    expect(await countActiveAdmins()).toBe(2)
  })

  it('cambiar la contraseña la deja verificable y no guarda la anterior', async () => {
    const admin = await crearUsuario('admin')
    const user = await crearUsuario('lawyer')

    await setUserPassword(user.id, await hashPassword('OtraClave2026'), admin.id)
    const releida = await findUserByEmail(user.email)

    expect(await verifyPassword('OtraClave2026', releida!.passwordHash)).toBe(true)
    expect(await verifyPassword('SoloLaboral26', releida!.passwordHash)).toBe(false)
  })

  it('la bitácora anota QUE se cambió la contraseña, jamás cuál es', async () => {
    const admin = await crearUsuario('admin')
    const user = await crearUsuario('lawyer')
    await setUserPassword(user.id, await hashPassword('OtraClave2026'), admin.id)

    const bitacora = await listAuditForEntity('user', user.id)
    const entrada = bitacora.find((e) => e.action === 'user_password_set')
    expect(entrada).toBeDefined()
    // Un registro que guardara la contraseña convertiría la auditoría en la fuga.
    expect(JSON.stringify(entrada)).not.toContain('OtraClave2026')
    expect(JSON.stringify(entrada)).not.toContain('scrypt$')
  })

  it('dar de baja no borra: la cuenta sigue en la lista con lo que hizo', async () => {
    const admin = await crearUsuario('admin')
    const user = await crearUsuario('lawyer', 'Renata Cárdenas')
    await setUserStatus(user.id, 'inactive', admin.id)

    const todos = await listAllUsers()
    const encontrada = todos.find((u) => u.id === user.id)
    expect(encontrada).toBeDefined()
    expect(encontrada!.status).toBe('inactive')
    expect(encontrada!.name).toBe('Renata Cárdenas')
  })
})

describe('plantilla de la ruta', () => {
  beforeEach(async () => {
    await resetDb()
    n = 0
  })

  it('un paso retirado no entra en los casos nuevos', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()
    const antes = plantilla!.items.length

    await setTemplateItemActive(plantilla!.items[2].id, false, admin.id)

    const caseId = await crearCasoConRuta(admin.id)
    const ruta = await listChecklist(caseId)
    expect(ruta).toHaveLength(antes - 1)
    expect(ruta.map((p) => p.title)).not.toContain(plantilla!.items[2].title)
    // Y las posiciones quedan seguidas, sin el hueco del paso retirado.
    expect(ruta.map((p) => p.position)).toEqual(ruta.map((_, i) => i + 1))
  })

  it('retirar un paso NO lo quita de los casos que ya lo llevaban', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()
    const caseId = await crearCasoConRuta(admin.id)
    const antes = await listChecklist(caseId)

    await setTemplateItemActive(plantilla!.items[2].id, false, admin.id)

    // Cambiar el procedimiento del despacho no reescribe un asunto en curso.
    const despues = await listChecklist(caseId)
    expect(despues).toHaveLength(antes.length)
    expect(despues.map((p) => p.title)).toEqual(antes.map((p) => p.title))
  })

  it('la base IMPIDE borrar un paso que algún caso usó', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()
    await crearCasoConRuta(admin.id)

    // Es la referencia con la que la cuadrícula empareja cada casilla con su
    // columna: un borrado la pondría a NULL y vaciaría una columna de casos vivos.
    await expect(
      db()`DELETE FROM case_checklist_template_items WHERE id = ${plantilla!.items[0].id}::uuid`,
    ).rejects.toThrow()
  })

  it('no se puede retirar el último paso vigente', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()

    for (const item of plantilla!.items.slice(0, -1)) {
      expect((await setTemplateItemActive(item.id, false, admin.id)).ok).toBe(true)
    }
    const ultimo = plantilla!.items[plantilla!.items.length - 1]

    // Una plantilla vacía crearía casos sin ruta: se convierten, no fallan, y
    // aparecen con progreso 0/0 que nadie puede avanzar. Peor que un error.
    const result = await setTemplateItemActive(ultimo.id, false, admin.id)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('last_one')

    const despues = await findDefaultTemplate()
    expect(despues!.items.filter((i) => i.isActive)).toHaveLength(1)
  })

  it('reponer un paso lo devuelve a los casos nuevos', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()
    const paso = plantilla!.items[1]

    await setTemplateItemActive(paso.id, false, admin.id)
    await setTemplateItemActive(paso.id, true, admin.id)

    const ruta = await listChecklist(await crearCasoConRuta(admin.id))
    expect(ruta.map((p) => p.title)).toContain(paso.title)
  })

  it('editar el texto no toca los casos que ya llevaban el paso', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()
    const caseId = await crearCasoConRuta(admin.id)
    const titulo = plantilla!.items[0].title

    await updateTemplateItem(plantilla!.items[0].id, { title: 'Título nuevo' }, admin.id)

    const ruta = await listChecklist(caseId)
    expect(ruta[0].title).toBe(titulo)
    // Pero el caso siguiente sí nace con el texto nuevo.
    const otro = await listChecklist(await crearCasoConRuta(admin.id))
    expect(otro[0].title).toBe('Título nuevo')
  })

  it('mover un paso intercambia posiciones sin chocar con el índice único', async () => {
    const admin = await crearUsuario('admin')
    const antes = (await findDefaultTemplate())!.items
    const [primero, segundo] = antes

    expect(await moveTemplateItem(segundo.id, 'up', admin.id)).toBe(true)

    const despues = (await findDefaultTemplate())!.items
    expect(despues[0].id).toBe(segundo.id)
    expect(despues[1].id).toBe(primero.id)
    // Las posiciones siguen siendo únicas y contiguas.
    expect(despues.map((i) => i.position)).toEqual(antes.map((i) => i.position))
  })

  it('mover el primero hacia arriba no hace nada y no revienta', async () => {
    const admin = await crearUsuario('admin')
    const items = (await findDefaultTemplate())!.items
    expect(await moveTemplateItem(items[0].id, 'up', admin.id)).toBe(false)
    expect((await findDefaultTemplate())!.items[0].id).toBe(items[0].id)
  })

  it('un paso añadido va al final y entra en los casos nuevos', async () => {
    const admin = await crearUsuario('admin')
    const plantilla = await findDefaultTemplate()

    await createTemplateItem(plantilla!.id, { title: 'Archivar expediente' }, admin.id)

    const despues = await findDefaultTemplate()
    expect(despues!.items[despues!.items.length - 1].title).toBe('Archivar expediente')

    const ruta = await listChecklist(await crearCasoConRuta(admin.id))
    expect(ruta[ruta.length - 1].title).toBe('Archivar expediente')
  })

  it('dice en cuántos casos se usa cada paso', async () => {
    const admin = await crearUsuario('admin')
    await crearCasoConRuta(admin.id)
    await crearCasoConRuta(admin.id)

    const [plantilla] = await listTemplates()
    // Es lo que hace visible en la pantalla que retirar no es borrar.
    expect(plantilla.items[0].usedByCases).toBe(2)
  })
})
