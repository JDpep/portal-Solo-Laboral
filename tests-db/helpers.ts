import { afterAll } from 'vitest'
import { closeDb, db } from '@/lib/db/sql'
import { createUser } from '@/lib/db/users'

/**
 * Deja las tablas operativas vacías entre pruebas.
 *
 * TRUNCATE y no DELETE, y no es un detalle de rendimiento: `audit_logs` y
 * `case_status_history` tienen un trigger que RECHAZA el borrado —esa es su
 * garantía— y solo se dejan vaciar así. Que la propia suite tenga que
 * esquivarlo es la prueba de que el candado está puesto.
 *
 * Las plantillas NO se tocan: las siembra la migración y son configuración,
 * no datos de la prueba.
 */
export async function resetDb(): Promise<void> {
  const sql = db()
  await sql.unsafe(`
    TRUNCATE audit_logs, case_status_history, calendar_events,
             case_checklist_items, cases, leads, staff_users
    RESTART IDENTITY CASCADE
  `)
  // El folio vuelve a empezar en SL-000001, para poder afirmarlo tal cual.
  await sql.unsafe('ALTER SEQUENCE folio_seq RESTART')
}

let counter = 0

export async function crearAbogado(name = 'Abogada de prueba') {
  counter += 1
  return createUser({
    name,
    email: `abogado${counter}@prueba.local`,
    role: 'lawyer',
    passwordHash: 'scrypt$00$00',
  })
}

afterAll(async () => {
  await closeDb()
})
