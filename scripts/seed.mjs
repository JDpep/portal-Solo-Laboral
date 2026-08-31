/**
 * SIEMBRA INICIAL.
 *
 *   npm run db:seed           deja listas las cuentas de demostración
 *   npm run db:seed -- --demo además, seis solicitudes de ejemplo
 *
 * Ya no corre en cada petición como en la Fase 1: con la base real los datos
 * son uno solo y esto se ejecuta UNA vez. Es idempotente —volver a correrlo no
 * duplica nada— para que sea seguro repetirlo sin pensar.
 *
 * Las dos cuentas de abajo son de DEMOSTRACIÓN, para poder enseñar el portal.
 * La contraseña se toma de SEED_DEMO_PASSWORD en .env.local, nunca de aquí.
 * Antes de operar con clientes reales hay que darlas de baja y crear las del
 * despacho con contraseñas propias.
 */
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'
import postgres from 'postgres'
import { loadEnv } from './env.mjs'

loadEnv()

const scrypt = promisify(scryptCb)
const KEY_LENGTH = 64

/** Mismo formato que src/lib/auth/password.ts: 'scrypt$sal$hash'. */
async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Compartida por las dos cuentas de demostración.
 *
 * Vive en .env.local —que .gitignore excluye— y NO en este archivo: el
 * repositorio es público y estas cuentas entran al portal de producción, donde
 * hay datos personales de gente real. Debe cumplir el mínimo que exige
 * validatePasswordStrength en src/lib/auth/password.ts: diez caracteres,
 * minúscula, mayúscula y número.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD
if (!DEMO_PASSWORD) {
  console.error(
    'Falta SEED_DEMO_PASSWORD en .env.local: es la contraseña de las cuentas\n' +
      'de demostración. No se escribe en el código porque el repo es público.',
  )
  process.exit(1)
}

const ACCOUNTS = [
  { name: 'Administración Solo Laboral', email: 'Admin@SL.mx', role: 'admin' },
  { name: 'Renata Cárdenas', email: 'User@SL.mx', role: 'lawyer' },
]

/** Cuentas de una siembra anterior. No se borran —se llevarían consigo la
 *  autoría de lo que hubieran hecho— pero se dan de baja: inactiva no entra. */
const LEGACY_EMAILS = ['admin@sololaboral.mx', 'abogados@sololaboral.mx']

/** Los tres últimos reproducen los ejemplos del alcance: fuera de cobertura,
 *  despido viejo, y el límite exacto de 60 días (que NO califica). */
const DEMO_LEADS = [
  {
    fullName: 'Juan Pérez Villanueva', phone: '5541239876', state: 'CMX', daysAgo: 20,
    description:
      'Trabajaba en un almacén de la colonia Granjas desde hace cuatro años. El lunes me dijeron que ya no me presentara y no me dieron nada por escrito ni liquidación.',
  },
  {
    fullName: 'María Fernanda Solís Aguirre', phone: '5528461130', state: 'MEX', daysAgo: 6,
    description:
      'Me despidieron de una tienda en Ecatepec después de avisar que estaba embarazada. Me ofrecieron dos semanas de sueldo para que firmara mi renuncia y no firmé.',
    callIn: { dayOffset: 1, time: '16:20' },
  },
  {
    fullName: 'Ricardo Ontiveros Lara', phone: '5567012244', state: 'CMX', daysAgo: 45,
    description:
      'Llevaba once años en la empresa como chofer. Me liquidaron con mucho menos de lo que me tocaba y me hicieron firmar de recibido sin dejarme leer.',
  },
  {
    fullName: 'Alejandra Nava Quintero', phone: '9811457023', state: 'CAM', daysAgo: 10,
    description:
      'Me corrieron de un hotel en Campeche sin pagarme mi finiquito ni las vacaciones que tenía acumuladas.',
  },
  {
    fullName: 'Gustavo Adolfo Rentería Mora', phone: '5590033471', state: 'CMX', daysAgo: 85,
    description:
      'Me despidieron hace casi tres meses de una empresa de seguridad privada y nunca me dieron mi finiquito.',
  },
  {
    fullName: 'Patricia Elizondo Mancera', phone: '5512780064', state: 'MEX', daysAgo: 60,
    description:
      'Me despidieron justo hace dos meses de una maquiladora en Tlalnepantla y no me quisieron dar constancia de nada.',
  },
]

// Mismas dos condiciones que src/lib/domain/qualification.ts. Se repiten aquí
// —y solo aquí— porque este script es JavaScript suelto y no puede importar
// el módulo TypeScript. Si el criterio cambia, cambia en los dos sitios.
const QUALIFYING_STATES = ['CMX', 'MEX']
const RECENCY_LIMIT_DAYS = 60

function qualify(state, daysAgo) {
  const allowedState = QUALIFYING_STATES.includes(state)
  const recent = daysAgo < RECENCY_LIMIT_DAYS
  if (allowedState && recent) {
    return { status: 'qualified', reason: 'qualified_allowed_state_and_recent_dismissal' }
  }
  if (!allowedState && !recent) {
    return { status: 'unqualified', reason: 'unqualified_state_and_dismissal_date' }
  }
  return {
    status: 'unqualified',
    reason: allowedState ? 'unqualified_dismissal_date' : 'unqualified_state',
  }
}

function plainDate(daysFromToday) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromToday)
  return d.toISOString().slice(0, 10)
}

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
if (!url) {
  console.error('Falta POSTGRES_URL en .env.local')
  process.exit(1)
}

/**
 * EN QUÉ ESQUEMA se siembra.
 *
 * Antes no se elegía: la conexión salía con el `search_path` por omisión y todo
 * caía en `public`, es decir, en producción. Bastaba con arrancar el portal en
 * local para tener el servidor de desarrollo escribiendo sobre los datos del
 * despacho, y `npm run db:seed` sembrando ahí cuentas y solicitudes de mentira.
 *
 * Ahora sigue a POSTGRES_SCHEMA, la misma variable que lee la aplicación, de
 * modo que sembrar y leer no pueden apuntar a sitios distintos. `--schema` gana
 * cuando hace falta ser explícito.
 */
const schemaFlag = process.argv.indexOf('--schema')
const schema =
  schemaFlag !== -1 ? process.argv[schemaFlag + 1] : (process.env.POSTGRES_SCHEMA ?? 'public')
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  console.error(`Nombre de esquema inválido: ${schema}`)
  process.exit(1)
}

const sql = postgres(url, {
  prepare: false,
  onnotice: () => {},
  connection: { search_path: `${schema}, extensions` },
})
const withDemo = process.argv.includes('--demo')

console.log(`
ESQUEMA  ${schema}${schema === 'public' ? '  (PRODUCCIÓN)' : ''}`)

try {
  console.log('\nCUENTAS')
  for (const account of ACCOUNTS) {
    // El hash se rehace en cada corrida: así el script no solo crea la cuenta,
    // también devuelve una que ya existía a la contraseña de demostración.
    const passwordHash = await hashPassword(DEMO_PASSWORD)
    const [existing] = await sql`SELECT id FROM staff_users WHERE email = ${account.email}`
    if (existing) {
      await sql`
        UPDATE staff_users
        SET name = ${account.name},
            role = ${account.role}::staff_role,
            password_hash = ${passwordHash},
            status = 'active'
        WHERE id = ${existing.id}
      `
      console.log(`  actualizada ${account.email}  (${account.role})`)
    } else {
      await sql`
        INSERT INTO staff_users (name, email, role, password_hash)
        VALUES (${account.name}, ${account.email}, ${account.role}::staff_role, ${passwordHash})
      `
      console.log(`  creada      ${account.email}  (${account.role})`)
    }
    console.log(`              contraseña: ${DEMO_PASSWORD}`)
  }

  for (const email of LEGACY_EMAILS) {
    const rows = await sql`
      UPDATE staff_users SET status = 'inactive'
      WHERE email = ${email} AND status = 'active'
      RETURNING id
    `
    if (rows.length) console.log(`  dada de baja ${email}`)
  }

  if (withDemo) {
    console.log('\nSOLICITUDES DE EJEMPLO')
    const submittedOn = plainDate(0)
    for (const [index, demo] of DEMO_LEADS.entries()) {
      const [existing] = await sql`
        SELECT id FROM leads WHERE phone = ${demo.phone} AND is_demo
      `
      if (existing) {
        console.log(`  ya existe   ${demo.fullName}`)
        continue
      }
      const dismissalDate = plainDate(-demo.daysAgo)
      const verdict = qualify(demo.state, demo.daysAgo)
      const stamp = `${submittedOn}T12:${String(index).padStart(2, '0')}:00.000Z`
      const callDate = demo.callIn ? plainDate(demo.callIn.dayOffset) : null

      await sql`
        INSERT INTO leads (
          folio, full_name, phone, state, dismissal_date, description,
          source, submitted_at, submitted_on,
          qualification_status, qualification_reason, dismissal_days_at_submission,
          call_preference_date, call_preference_time, call_preference_set_at, is_demo
        ) VALUES (
          CASE WHEN ${verdict.status} = 'qualified' THEN next_folio() ELSE NULL END,
          ${demo.fullName}, ${demo.phone}, ${demo.state}, ${dismissalDate}::date,
          ${demo.description}, 'web_form', ${stamp}::timestamptz, ${submittedOn}::date,
          ${verdict.status}::qualification_status, ${verdict.reason}::qualification_reason,
          ${demo.daysAgo},
          ${callDate}::date, ${demo.callIn?.time ?? null},
          ${callDate ? stamp : null}::timestamptz, true
        )
      `
      const mark = verdict.status === 'qualified' ? 'califica    ' : 'no califica '
      console.log(`  ${mark}${demo.fullName}`)
    }
  }

  const [counts] = await sql`
    SELECT
      (SELECT count(*)::int FROM staff_users) AS usuarios,
      (SELECT count(*)::int FROM leads) AS leads,
      (SELECT count(*)::int FROM leads WHERE visible_to_staff) AS visibles,
      (SELECT count(*)::int FROM cases) AS casos,
      (SELECT count(*)::int FROM case_checklist_templates) AS plantillas
  `
  console.log(
    `\nEN LA BASE  ${counts.usuarios} usuarios · ${counts.leads} leads ` +
      `(${counts.visibles} visibles) · ${counts.casos} casos · ${counts.plantillas} plantilla(s)\n`,
  )
} catch (error) {
  console.error('\nFalló la siembra:', error.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
