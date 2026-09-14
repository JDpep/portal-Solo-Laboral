import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from './helpers'
import { db } from '@/lib/db/sql'
import { findUserByEmail, createUser, setUserStatus } from '@/lib/db/users'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { ensureTestAccounts, passwordProblem } from '../scripts/cuentas-pruebas.mjs'

/**
 * LAS CUENTAS DE PRUEBAS INTERNAS.
 *
 * Lo que se promete: tras cada despliegue las tres entran con la contraseña
 * acordada, con su rol, activas; y un despliegue que no tiene nada que corregir
 * no le cierra la sesión a nadie.
 */
const PASSWORD = 'SoloLaboral26'
const silencio = () => {}
const sync = () => ensureTestAccounts(db(), PASSWORD, silencio)

beforeEach(async () => {
  await resetDb()
})

describe('cuentas de pruebas', () => {
  it('crea las tres con su rol y la contraseña acordada', async () => {
    await sync()
    for (const [email, role] of [
      ['superadmin@sl.com', 'superadmin'],
      ['ADMIN@sl.com', 'admin'],
      ['abogado@SL.COM', 'lawyer'],
    ] as const) {
      // citext: el correo entra escrito como sea.
      const user = await findUserByEmail(email)
      expect(user?.role).toBe(role)
      expect(user?.status).toBe('active')
      expect(await verifyPassword(PASSWORD, user!.passwordHash)).toBe(true)
    }
  })

  it('volver a correr no toca nada ni revoca sesiones', async () => {
    await sync()
    const antes = await findUserByEmail('Admin@SL.com')
    await sync()
    const despues = await findUserByEmail('Admin@SL.com')
    expect(despues?.passwordHash).toBe(antes?.passwordHash)
    expect(despues?.passwordChangedAt).toBe(antes?.passwordChangedAt)
  })

  it('restaura contraseña, rol y baja si alguien los cambió', async () => {
    await sync()
    const abogado = await findUserByEmail('Abogado@SL.com')
    await db()`
      UPDATE staff_users SET password_hash = ${await hashPassword('OtraClave123')}, role = 'admin'
      WHERE id = ${abogado!.id}::uuid
    `
    await setUserStatus(abogado!.id, 'inactive')

    await sync()
    const restaurado = await findUserByEmail('Abogado@SL.com')
    expect(restaurado?.role).toBe('lawyer')
    expect(restaurado?.status).toBe('active')
    expect(await verifyPassword(PASSWORD, restaurado!.passwordHash)).toBe(true)
  })

  it('da de baja las cuentas de demostración anteriores', async () => {
    const vieja = await createUser({
      name: 'Renata',
      email: 'User@SL.mx',
      role: 'lawyer',
      passwordHash: await hashPassword(PASSWORD),
    })
    await sync()
    expect((await findUserByEmail('User@SL.mx'))?.status).toBe('inactive')
    expect(vieja.id).toBeTruthy()
  })

  it('sin contraseña válida no hace nada y falla', async () => {
    expect(passwordProblem(undefined)).toMatch(/falta/)
    expect(passwordProblem('corta1A')).toMatch(/mínimo/)
    await expect(ensureTestAccounts(db(), '', silencio)).rejects.toThrow()
    expect(await findUserByEmail('Admin@SL.com')).toBeNull()
  })
})
