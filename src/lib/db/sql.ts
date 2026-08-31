/**
 * CONEXIÓN A POSTGRES.
 *
 * El navegador NUNCA habla con la base. Todas las tablas tienen RLS activo y
 * ninguna política, así que la llave publicable no sirve para leer nada: la
 * única puerta es el servidor, y pasa por aquí.
 *
 * Dos cosas que este módulo resuelve y que el resto del sistema da por hechas:
 *
 *  1. UNA sola conexión por proceso. En serverless cada invocación reutiliza
 *     la del módulo mientras la instancia viva; abrir una por consulta agota
 *     el pooler en cuanto hay tráfico.
 *
 *  2. TRANSACCIONES que atraviesan repositorios. `transaction()` mete la
 *     conexión de la transacción en un AsyncLocalStorage, y `db()` la
 *     encuentra sola. Así `crearCaso()` y `registrarBitacora()` —que no se
 *     conocen entre sí— acaban en la MISMA transacción sin tener que pasarse
 *     un parámetro por media aplicación. Es lo que hace posible que un caso
 *     creado a medias no exista.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import postgres from 'postgres'
import type { Sql, TransactionSql } from 'postgres'

function connectionString(): string {
  const url = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING
  if (!url) {
    throw new Error(
      'POSTGRES_URL no está configurado. El portal no arranca sin base de datos.',
    )
  }
  return url
}

/**
 * Esquema de trabajo. `public` es producción; `test` y `dev` son copias
 * completas del esquema en la misma base —mismas reglas, mismos triggers,
 * mismas restricciones— sobre las que se puede escribir sin rozar un dato real.
 *
 * Vercel no define la variable, así que el portal desplegado siempre sale en
 * `public`. Quien trabaja en local pone POSTGRES_SCHEMA=dev en su .env.local y
 * su servidor de desarrollo deja de escribir sobre los datos del despacho.
 */
// `|| undefined` y no `??`: una variable puesta pero VACÍA —fácil de dejar así
// en un panel de configuración— pasaría el `??` y dejaría el `search_path` sin
// esquema, con la aplicación fallando por todas partes sin decir por qué.
const SCHEMA_ELEGIDO = process.env.POSTGRES_SCHEMA || undefined
const SCHEMA = SCHEMA_ELEGIDO ?? 'public'

/**
 * NO SE ARRANCA `next dev` CONTRA PRODUCCIÓN POR DESCUIDO.
 *
 * Documentarlo en el README no basta: quien clona el repo en otra máquina y
 * escribe `npm run dev` no ha leído nada todavía, y lo que pase entonces se
 * escribe sobre datos personales de prospectos reales. Así que en desarrollo el
 * esquema hay que ELEGIRLO; no hay valor por omisión.
 *
 * La condición es `NODE_ENV === 'development'`, que solo pone `next dev`. En
 * producción y en las vistas previas de Vercel vale 'production', de modo que
 * esta guarda no puede dispararse ahí ni tumbar el portal —que es exactamente
 * lo que no debe hacer una comprobación de seguridad.
 *
 * Poner `POSTGRES_SCHEMA=public` a mano sigue permitido: mirar producción desde
 * local es legítimo de vez en cuando. Lo que deja de existir es hacerlo sin
 * enterarse.
 */
function exigirEsquemaExplicitoEnDesarrollo(): void {
  if (SCHEMA_ELEGIDO && !/^[a-z_][a-z0-9_]*$/.test(SCHEMA_ELEGIDO)) {
    throw new Error(`POSTGRES_SCHEMA no es un nombre de esquema válido: «${SCHEMA_ELEGIDO}»`)
  }
  if (SCHEMA_ELEGIDO || process.env.NODE_ENV !== 'development') return
  throw new Error(
    'POSTGRES_SCHEMA no está definido y esto es desarrollo.\n\n' +
      'Sin él, el servidor de desarrollo escribiría en «public», que es la base\n' +
      'REAL del despacho, con datos personales de prospectos.\n\n' +
      'Añade a .env.local:\n' +
      '    POSTGRES_SCHEMA=dev\n\n' +
      'y prepara esa réplica una sola vez:\n' +
      '    npm run db:migrate\n' +
      '    npm run db:seed -- --demo\n\n' +
      'Si de verdad quieres mirar producción desde local, ponlo explícito:\n' +
      '    POSTGRES_SCHEMA=public',
  )
}

const globalRef = globalThis as unknown as { __slSql?: Sql }

function client(): Sql {
  if (!globalRef.__slSql) {
    // Va aquí y no en la carga del módulo: el build de producción importa este
    // archivo sin consultar nada, y reventar ahí rompería el despliegue.
    exigirEsquemaExplicitoEnDesarrollo()
    // Una línea al abrir la conexión, no en cada consulta. Trabajar sin saber
    // contra qué base se escribe es exactamente como se acaba sembrando datos
    // de mentira en producción.
    if (SCHEMA !== 'public') {
      console.log(`[db] esquema «${SCHEMA}» — copia de trabajo, no es producción`)
    }
    globalRef.__slSql = postgres(connectionString(), {
      // El pooler en modo transacción no conserva sentencias preparadas.
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // `extensions` va detrás para que citext se resuelva sin calificar.
      connection: { search_path: `${SCHEMA}, extensions` },
      onnotice: () => {},
    })
  }
  return globalRef.__slSql
}

const transactionStore = new AsyncLocalStorage<TransactionSql>()

/**
 * La conexión que toca usar AHORA: la de la transacción en curso si la hay, y
 * si no, la del pool. Todo repositorio consulta con esto y con nada más.
 */
export function db(): Sql | TransactionSql {
  return transactionStore.getStore() ?? client()
}

/**
 * Corre `fn` dentro de una transacción. Si lanza, se deshace TODO lo que se
 * escribió dentro, venga del repositorio que venga.
 *
 * Anidar es seguro: una transacción dentro de otra abre un savepoint en vez
 * de una transacción nueva, así que una función que ya sabe protegerse no se
 * rompe al llamarla desde un flujo más grande que también se protege.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const current = transactionStore.getStore()
  if (current) {
    return current.savepoint((sp) => transactionStore.run(sp as TransactionSql, fn)) as Promise<T>
  }
  return client().begin((tx) => transactionStore.run(tx, fn)) as Promise<T>
}

/** Cierra la conexión. Solo para scripts y tests: en la app no se llama. */
export async function closeDb(): Promise<void> {
  if (globalRef.__slSql) {
    await globalRef.__slSql.end()
    globalRef.__slSql = undefined
  }
}

/**
 * Fila cruda tal como la devuelve Postgres: claves en snake_case y valores sin
 * tipar. Vive solo entre la consulta y su mapeador; nada fuera de src/lib/db
 * llega a verla. Tenerla con nombre evita repartir `any` sueltos por cuatro
 * repositorios.
 */
export type Row = Record<string, any>

/** timestamptz -> ISO. Postgres devuelve Date; el resto del sistema usa ISO. */
export function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/** Igual, para las columnas que nunca son nulas. */
export function isoRequired(value: Date | string): string {
  return iso(value) as string
}
