import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * PRUEBAS DE INTEGRACIÓN, contra Postgres de verdad.
 *
 * Corren sobre el esquema `test`: una réplica completa —mismas tablas, mismos
 * triggers, mismas restricciones— dentro de la misma base. Así se comprueban
 * las garantías que viven en la BASE (el folio único, el caso irrepetible, la
 * bitácora que no se puede reescribir) sin poder rozar un dato del despacho.
 *
 * Un doble en memoria habría probado el doble, no las reglas.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-db/**/*.test.ts'],
    setupFiles: ['tests-db/setup.ts'],
    // Los archivos comparten la misma base y cada uno vacía las tablas entre
    // pruebas: si corrieran a la vez se pisarían.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
