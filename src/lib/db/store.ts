/**
 * ALMACÉN EN MEMORIA — Fase 1.
 *
 * Es la única pieza que se reemplaza al conectar Postgres: todo lo demás habla
 * con los repositorios de src/lib/db/*.ts, nunca con estas estructuras.
 *
 * Limitaciones conocidas y aceptadas en esta fase:
 *  - los envíos viven mientras viva el proceso;
 *  - el consecutivo de número de caso y el límite de envíos cuentan por
 *    instancia, no por despliegue.
 */
import type { Lead, StaffUser } from '@/lib/domain/types'

export interface Store {
  users: StaffUser[]
  leads: Lead[]
  /** Consecutivo del número de caso. En Fase 2 lo sustituye una SEQUENCE. */
  caseSequence: number
  seeded: boolean
}

/** Sobrevive al hot-reload de `next dev`, que reevalúa los módulos. */
const globalRef = globalThis as unknown as { __slStore?: Store }

export function getStore(): Store {
  if (!globalRef.__slStore) {
    globalRef.__slStore = {
      users: [],
      leads: [],
      caseSequence: 0,
      seeded: false,
    }
  }
  return globalRef.__slStore
}

/**
 * Copia defensiva antes de salir del repositorio.
 *
 * Sin esto un `find…()` devuelve la MISMA referencia que vive en el almacén y
 * quien la reciba puede mutarla sin pasar por el repositorio. Postgres devuelve
 * filas, no referencias; aquí se imita ese contrato.
 */
export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function cloneAll<T>(values: T[]): T[] {
  return values.map((value) => structuredClone(value))
}

let counter = 0

/** Id opaco y estable. En Fase 2 lo sustituye un uuid de Postgres. */
export function newId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(3, '0')}`
}

/** Reinicia el almacén. Solo para tests. */
export function resetStore(): void {
  globalRef.__slStore = {
    users: [],
    leads: [],
    caseSequence: 0,
    seeded: false,
  }
}
