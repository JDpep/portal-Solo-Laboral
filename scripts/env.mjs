/**
 * Carga .env.local para los scripts de línea de comandos.
 *
 * Next.js lo hace solo en la aplicación; `node scripts/…` no. Se lee a mano
 * en vez de añadir dotenv: son doce líneas y una dependencia menos que
 * auditar en un proyecto que maneja datos personales.
 */
import { readFileSync } from 'node:fs'

export function loadEnv(file = '.env.local') {
  let raw
  try {
    raw = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, value] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = value.replace(/^["']|["']$/g, '')
  }
}
