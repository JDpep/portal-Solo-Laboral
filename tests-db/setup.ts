/**
 * Arranque de las pruebas de integración.
 *
 * Vitest no lee .env.local, así que se carga a mano antes de que cualquier
 * módulo abra una conexión. Y se FUERZA el esquema `test`: si esto faltara, la
 * suite escribiría —y truncaría— las tablas de producción.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raw = (() => {
  try {
    return readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    return ''
  }
})()

for (const line of raw.split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!match) continue
  const [, key, value] = match
  if (process.env[key] === undefined) process.env[key] = value.replace(/^["']|["']$/g, '')
}

// No es negociable ni configurable desde fuera: las pruebas nunca tocan public.
process.env.POSTGRES_SCHEMA = 'test'
