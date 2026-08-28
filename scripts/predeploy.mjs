/**
 * MIGRAR ANTES DE DESPLEGAR.
 *
 * Lo llama `npm run vercel-build`, que es el comando que Vercel usa para
 * construir. Corre UNA vez por despliegue, antes de `next build`, y si falla el
 * despliegue falla entero: producción se queda con la versión anterior, que
 * sigue funcionando, en vez de estrenar código que espera una columna que no
 * existe.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. El 2026-08-28 se subió a main un cambio que leía
 * una columna nueva y la migración se aplicó a mano DESPUÉS. Vercel despliega
 * solo al hacer push, así que durante esos minutos el portal sirvió código que
 * preguntaba por algo que la base todavía no tenía: la cuadrícula de Seguimiento
 * se quedó sin columnas en producción. El orden correcto no puede depender de
 * que alguien se acuerde.
 *
 * SOLO EN PRODUCCIÓN. Las vistas previas comparten las variables de entorno de
 * producción, así que sin esta guarda cada rama abierta migraría la base del
 * despacho. Una preview que necesite esquema nuevo se migra a mano y a
 * conciencia.
 *
 * NO corre en cada petición ni en cada arranque en frío: eso pediría un
 * ACCESS EXCLUSIVE por cada instancia que despierta y congelaría las lecturas
 * detrás de la cola de Postgres.
 */
import { spawnSync } from 'node:child_process'

const entorno = process.env.VERCEL_ENV ?? 'local'

if (entorno !== 'production') {
  console.log(`[predeploy] entorno «${entorno}»: no se migra. Solo producción migra sola.`)
  process.exit(0)
}

if (!process.env.POSTGRES_URL_NON_POOLING && !process.env.POSTGRES_URL) {
  // Sin conexión no se puede saber si la base está al día, y construir a ciegas
  // es justo lo que este archivo viene a impedir.
  console.error('[predeploy] falta POSTGRES_URL_NON_POOLING. No se despliega a ciegas.')
  process.exit(1)
}

console.log('[predeploy] aplicando migraciones pendientes en producción…')
const result = spawnSync(process.execPath, ['scripts/migrate.mjs'], { stdio: 'inherit' })

if (result.status !== 0) {
  console.error('[predeploy] la migración falló. Se aborta el despliegue.')
  process.exit(result.status ?? 1)
}
console.log('[predeploy] base al día.')
