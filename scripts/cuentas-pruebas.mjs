/**
 * CUENTAS DE PRUEBAS INTERNAS — se garantizan en CADA despliegue.
 *
 *   Superadmin@Sl.com   superadmin
 *   Admin@SL.com        admin
 *   Abogado@SL.com      abogado
 *
 * Decisión del despacho (2026-09-14): estas tres cuentas tienen que entrar
 * siempre, con la misma contraseña, después de cualquier despliegue. Por eso
 * `predeploy.mjs` corre esto en producción justo después de migrar: si alguien
 * les cambió la contraseña, el rol o las dio de baja, el despliegue las
 * devuelve a como se acordó.
 *
 * LA CONTRASEÑA NO ESTÁ AQUÍ. El repositorio es público y estas cuentas entran
 * al portal real, con datos personales de prospectos. Sale de la variable
 * SEED_DEMO_PASSWORD (Vercel → Production, y .env.local para dev). Sin ella el
 * despliegue falla: prometimos que las cuentas funcionan en cada deploy, y
 * desplegar sin poder cumplirlo sería romper la promesa en silencio.
 *
 * NO REVOCA SESIONES SIN MOTIVO: solo reescribe el hash (y el sello
 * password_changed_at, que corta las sesiones viejas) cuando la contraseña
 * guardada ya no es la acordada. Un despliegue normal no saca a nadie.
 *
 *   node scripts/cuentas-pruebas.mjs              en el esquema de POSTGRES_SCHEMA
 *   node scripts/cuentas-pruebas.mjs --schema dev
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { loadEnv, resolverEsquema } from './env.mjs'

const scrypt = promisify(scryptCb)
const KEY_LENGTH = 64

export const TEST_ACCOUNTS = [
  { name: 'Superadmin (pruebas)', email: 'Superadmin@Sl.com', role: 'superadmin' },
  { name: 'Admin (pruebas)', email: 'Admin@SL.com', role: 'admin' },
  { name: 'Abogado (pruebas)', email: 'Abogado@SL.com', role: 'lawyer' },
]

/** Cuentas de siembras anteriores. No se borran (se llevarían su autoría): se dan de baja. */
export const RETIRED_EMAILS = [
  'Admin@SL.mx',
  'User@SL.mx',
  'admin@sololaboral.mx',
  'abogados@sololaboral.mx',
]

/** Mismo formato que src/lib/auth/password.ts: 'scrypt$sal$hash'. */
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

async function verifyPassword(password, stored) {
  if (!stored) return false
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== 'scrypt' || !saltHex || !hashHex) return false
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  const expected = Buffer.from(hashHex, 'hex')
  return expected.length === derived.length && timingSafeEqual(derived, expected)
}

/** Mismo mínimo que validatePasswordStrength. */
export function passwordProblem(password) {
  if (!password) return 'falta SEED_DEMO_PASSWORD'
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'SEED_DEMO_PASSWORD no cumple el mínimo (10 caracteres, minúscula, mayúscula y número)'
  }
  return null
}

/**
 * Deja las cuentas como se acordó. Idempotente. `sql` ya debe apuntar al
 * esquema correcto (search_path). Todo en una transacción.
 */
export async function ensureTestAccounts(sql, password, log = console.log) {
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)

  await sql.begin(async (tx) => {
    for (const account of TEST_ACCOUNTS) {
      const [existing] = await tx`
        SELECT id, name, role, status, password_hash FROM staff_users WHERE email = ${account.email}
      `
      if (!existing) {
        const [created] = await tx`
          INSERT INTO staff_users (name, email, role, password_hash, password_changed_at)
          VALUES (${account.name}, ${account.email}, ${account.role}::staff_role,
                  ${await hashPassword(password)}, now())
          RETURNING id
        `
        await tx`
          INSERT INTO audit_logs (user_id, action, entity, entity_id, after)
          VALUES (NULL, 'user_create', 'user', ${created.id},
                  ${JSON.stringify({ email: account.email, role: account.role, via: 'cuentas de pruebas' })}::jsonb)
        `
        log(`  creada       ${account.email}  (${account.role})`)
        continue
      }

      const passwordOk = await verifyPassword(password, existing.password_hash)
      const changes = []
      if (existing.name !== account.name) changes.push('nombre')
      if (existing.role !== account.role) changes.push('rol')
      if (existing.status !== 'active') changes.push('reactivada')
      if (!passwordOk) changes.push('contraseña')

      if (changes.length === 0) {
        log(`  al día       ${account.email}  (${account.role})`)
        continue
      }

      if (passwordOk) {
        await tx`
          UPDATE staff_users
             SET name = ${account.name}, role = ${account.role}::staff_role, status = 'active'
           WHERE id = ${existing.id}
        `
      } else {
        await tx`
          UPDATE staff_users
             SET name = ${account.name}, role = ${account.role}::staff_role, status = 'active',
                 password_hash = ${await hashPassword(password)}, password_changed_at = now()
           WHERE id = ${existing.id}
        `
      }
      await tx`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, after)
        VALUES (NULL, 'user_update', 'user', ${existing.id},
                ${JSON.stringify({ email: account.email, restored: changes, via: 'cuentas de pruebas' })}::jsonb)
      `
      log(`  restaurada   ${account.email}  (${changes.join(', ')})`)
    }

    for (const email of RETIRED_EMAILS) {
      const rows = await tx`
        UPDATE staff_users SET status = 'inactive'
         WHERE email = ${email} AND status = 'active'
        RETURNING id
      `
      if (rows.length) log(`  dada de baja ${email}`)
    }
  })
  // La contraseña NO se imprime: el registro del build no lo controla nadie.
}

// ─────────────────────────────────────────────────────── como script suelto
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv()
  const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
  if (!url) {
    console.error('[cuentas] falta POSTGRES_URL_NON_POOLING')
    process.exit(1)
  }
  // En Vercel resuelve a `public`, igual que al migrar; en local exige elegir.
  const schema = resolverEsquema(process.argv, 'cuentas-pruebas')
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    onnotice: () => {},
    connection: { search_path: `${schema}, extensions` },
  })
  try {
    console.log(`[cuentas] cuentas de pruebas en «${schema}»`)
    await ensureTestAccounts(sql, process.env.SEED_DEMO_PASSWORD)
  } catch (error) {
    console.error(`[cuentas] ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}
