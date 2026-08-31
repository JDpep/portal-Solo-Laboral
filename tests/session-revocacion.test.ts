import { describe, expect, it } from 'vitest'
import { sessionRevoked } from '@/lib/auth/session'

const enT = (ms: number) => ({ userId: 'u1', issuedAt: ms })

describe('cambiar la contraseña cierra las sesiones anteriores', () => {
  it('deja pasar a quien nunca la ha cambiado', () => {
    expect(sessionRevoked(enT(1_000), null)).toBe(false)
  })

  it('revoca la sesión emitida ANTES del cambio', () => {
    const cambio = new Date('2026-08-31T12:00:00.000Z')
    const antes = cambio.getTime() - 60_000
    expect(sessionRevoked(enT(antes), cambio.toISOString())).toBe(true)
  })

  it('mantiene la sesión emitida DESPUÉS del cambio', () => {
    const cambio = new Date('2026-08-31T12:00:00.000Z')
    const despues = cambio.getTime() + 60_000
    expect(sessionRevoked(enT(despues), cambio.toISOString())).toBe(false)
  })

  it('no se echa a sí mismo por unos milisegundos de desfase de reloj', () => {
    // La cookie la sella la función y el cambio lo sella Postgres: son dos
    // relojes. Sin margen, cambiar tu contraseña podría cerrar tu propia sesión
    // recién emitida y dejarte fuera justo después de acertar.
    const cambio = new Date('2026-08-31T12:00:00.000Z')
    const casiIgual = cambio.getTime() - 400
    expect(sessionRevoked(enT(casiIgual), cambio.toISOString())).toBe(false)
  })

  it('un sello ilegible no cierra la sesión de nadie', () => {
    // Fallar hacia el lado que echa a todo el mundo del portal por un dato
    // corrupto sería peor que el problema que resuelve.
    expect(sessionRevoked(enT(1_000), 'no es una fecha')).toBe(false)
  })
})
