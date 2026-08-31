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

/**
 * EN QUÉ ESQUEMA TRABAJA UN SCRIPT.
 *
 * Fuera de Vercel hay que elegirlo: ni `db:migrate` ni `db:seed` asumen
 * `public`. Sembrar por descuido en `public` no es un susto teórico —`db:seed`
 * reescribe las contraseñas de las cuentas que entran al portal real— y el
 * único aviso habría sido leer el README antes.
 *
 * En Vercel sí hay omisión: `predeploy.mjs` migra producción durante el build y
 * ahí `public` es la respuesta correcta y la única.
 *
 * @param {string[]} argv  process.argv, para leer `--schema <nombre>`
 * @param {string} script  nombre del script, solo para el mensaje de error
 * @returns {string}
 */
export function resolverEsquema(argv, script) {
  const i = argv.indexOf('--schema')
  const elegido = i !== -1 ? argv[i + 1] : process.env.POSTGRES_SCHEMA

  if (!elegido) {
    // En Vercel, `public`: es el único sitio donde migrar producción es lo que
    // se quiere, y predeploy.mjs ya se guarda de correr solo en producción.
    if (process.env.VERCEL_ENV) return 'public'
    console.error(
      `\n${script}: no has dicho en qué esquema trabajar.\n\n` +
        'Sin esto se usaría «public», que es la base REAL del despacho.\n\n' +
        'Para tu réplica de desarrollo, añade a .env.local:\n' +
        '    POSTGRES_SCHEMA=dev\n\n' +
        'Para tocar producción a propósito, dilo en voz alta:\n' +
        `    POSTGRES_SCHEMA=public npm run ${script}\n`,
    )
    process.exit(1)
  }

  if (!/^[a-z_][a-z0-9_]*$/.test(elegido)) {
    console.error(`Nombre de esquema inválido: ${elegido}`)
    process.exit(1)
  }
  return elegido
}
