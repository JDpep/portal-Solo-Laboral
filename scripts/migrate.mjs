/**
 * Aplicador de migraciones.
 *
 * Cada archivo de db/migrations corre UNA vez, dentro de una transacción, y
 * queda anotado en `schema_migrations`. Si una migración falla a la mitad, no
 * deja media migración aplicada: o entra entera o no entra (§46, §51).
 *
 *   npm run db:migrate                 aplica lo pendiente en el esquema de turno
 *   npm run db:migrate -- --dry        solo dice qué falta
 *   npm run db:migrate -- --schema test  crea una copia completa del esquema
 *
 * QUÉ ESQUEMA por omisión: el de POSTGRES_SCHEMA, que es el mismo que va a leer
 * la aplicación, y `public` si no está puesto. Así el que trabaja en local con
 * POSTGRES_SCHEMA=dev no puede migrar producción sin querer mientras su portal
 * lee otra cosa: migrar y leer apuntan siempre al mismo sitio. En Vercel la
 * variable no existe, de modo que el despliegue sigue migrando `public`.
 *
 * Los esquemas `test` y `dev` son réplicas exactas en la misma base: mismas
 * tablas, mismos triggers, mismas restricciones. Las pruebas de integración y el
 * servidor de desarrollo corren contra reglas reales de Postgres sin poder rozar
 * un dato del despacho.
 *
 * Usa la conexión SIN pooler (puerto 5432): el pooler en modo transacción no
 * admite el DDL con estado entre sentencias que hacen algunas migraciones.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { loadEnv } from './env.mjs'

loadEnv()

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

if (!url) {
  console.error('Falta POSTGRES_URL_NON_POOLING (o POSTGRES_URL) en .env.local')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry')
const schemaFlag = process.argv.indexOf('--schema')
const schema =
  schemaFlag !== -1 ? process.argv[schemaFlag + 1] : (process.env.POSTGRES_SCHEMA ?? 'public')
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  console.error(`Nombre de esquema inválido: ${schema}`)
  process.exit(1)
}
const sql = postgres(url, { prepare: false, onnotice: () => {} })

try {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  // Todo lo que sigue —incluida la propia tabla de control— vive dentro del
  // esquema elegido, así que `public` y `test` llevan su cuenta por separado.
  await sql.unsafe(`SET search_path TO ${schema}, extensions`)

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((r) => r.version))
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log(`Nada que aplicar en «${schema}». ${applied.size} migraciones ya en la base.`)
  }

  for (const file of pending) {
    if (dryRun) {
      console.log(`pendiente  ${file}`)
      continue
    }
    process.stdout.write(`aplicando  ${file} … `)
    const body = readFileSync(join(DIR, file), 'utf8')
    // sql.begin da una transacción real: si el archivo revienta a la mitad,
    // ROLLBACK y la versión no queda anotada.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${schema}, extensions`)
      await tx.unsafe(body)
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`
    })
    console.log('ok')
  }
} catch (error) {
  console.error('\nFalló la migración:', error.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
