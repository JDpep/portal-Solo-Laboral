/**
 * Punto de entrada del acceso a datos.
 *
 * Nadie fuera de src/lib/db abre una conexión ni escribe SQL. Las páginas y
 * las server actions llaman a estos repositorios y nada más.
 *
 * Ya no existe `ensureSeeded()`: los datos viven en Postgres, así que las
 * cuentas y las plantillas se crean una vez con `npm run db:seed` en vez de
 * sembrarse en cada petición. Con ello desaparecen de golpe los problemas de
 * la Fase 1 —ids distintos por instancia, folios que se recorrían al
 * reiniciar— porque ahora el dato es uno solo.
 */
export { db, transaction, closeDb } from '@/lib/db/sql'
export * from '@/lib/db/users'
export * from '@/lib/db/leads'
export * from '@/lib/db/cases'
export * from '@/lib/db/checklist'
export * from '@/lib/db/audit'
