/**
 * Punto de entrada del acceso a datos. Nadie fuera de src/lib/db toca
 * `getStore()`. En Fase 2 estos repositorios cambian por consultas SQL
 * manteniendo la misma firma.
 */
import { getStore } from '@/lib/db/store'
import { seedIfEmpty } from '@/lib/db/seed'

let seeding: Promise<void> | null = null

/** Idempotente y a prueba de llamadas concurrentes. */
export async function ensureSeeded(): Promise<void> {
  if (getStore().seeded) return
  // El candado se libera al terminar: si el almacén se reinicia (tests, o un
  // proceso nuevo), la siguiente llamada vuelve a sembrar.
  if (!seeding) {
    seeding = seedIfEmpty().finally(() => {
      seeding = null
    })
  }
  await seeding
}

export * from '@/lib/db/users'
export * from '@/lib/db/leads'
