import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/sql'
import {
  LOGIN_POLICY,
  checkRate,
  clearRate,
  purgeRateLimits,
  registerHit,
  resetRateLimits,
} from '@/lib/auth/rate-limit'

/**
 * El límite de intentos, contra Postgres de verdad.
 *
 * Se prueba aquí y no con un doble en memoria porque lo que se quiere
 * comprobar es exactamente lo que el doble no tiene: que la cuenta vive en la
 * base y la comparte todo el mundo. Un doble volvería a probar un contador por
 * proceso, que es el problema que esto vino a resolver.
 */
beforeEach(async () => {
  await resetRateLimits()
})

const politica = { limit: 3, windowMs: 60_000 }

describe('límite de intentos', () => {
  it('deja pasar mientras no se llega al tope', async () => {
    await registerHit('a')
    await registerHit('a')
    expect((await checkRate('a', politica)).allowed).toBe(true)
  })

  it('bloquea al alcanzar el tope', async () => {
    for (let i = 0; i < 3; i++) await registerHit('a')
    const r = await checkRate('a', politica)
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSeconds).toBeGreaterThan(0)
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('no mezcla claves distintas', async () => {
    // Si se mezclaran, el ataque contra una cuenta dejaría fuera a las demás.
    for (let i = 0; i < 3; i++) await registerHit('correo-uno')
    expect((await checkRate('correo-uno', politica)).allowed).toBe(false)
    expect((await checkRate('correo-dos', politica)).allowed).toBe(true)
  })

  it('acertar la contraseña borra la cuenta de intentos', async () => {
    for (let i = 0; i < 3; i++) await registerHit('a')
    await clearRate('a')
    expect((await checkRate('a', politica)).allowed).toBe(true)
  })

  it('la ventana DESLIZA: los intentos viejos dejan de contar', async () => {
    // Tres intentos de hace dos minutos con una ventana de uno: ya no cuentan.
    await db()`
      INSERT INTO rate_limit_hits (bucket, hit_at)
      SELECT 'a', now() - interval '2 minutes' FROM generate_series(1, 3)
    `
    expect((await checkRate('a', politica)).allowed).toBe(true)

    // Y uno reciente sí cuenta, aunque los viejos sigan en la tabla.
    for (let i = 0; i < 3; i++) await registerHit('a')
    expect((await checkRate('a', politica)).allowed).toBe(false)
  })

  it('la cuenta la comparten todas las instancias', async () => {
    // Es el punto entero del cambio: quien apunta y quien pregunta no
    // comparten proceso, solo la base.
    await db()`
      INSERT INTO rate_limit_hits (bucket, hit_at)
      SELECT 'login|alguien|1.2.3.4', now() FROM generate_series(1, ${LOGIN_POLICY.limit})
    `
    expect((await checkRate('login|alguien|1.2.3.4', LOGIN_POLICY)).allowed).toBe(false)
  })

  it('la purga se lleva lo viejo y respeta lo que aún cuenta', async () => {
    await db()`
      INSERT INTO rate_limit_hits (bucket, hit_at)
      VALUES ('a', now() - interval '30 hours'), ('a', now())
    `
    expect(await purgeRateLimits(24)).toBe(1)
    const [fila] = await db()`SELECT count(*)::int AS n FROM rate_limit_hits WHERE bucket = 'a'`
    expect(fila.n).toBe(1)
  })
})
