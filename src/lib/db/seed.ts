/**
 * DATOS DE ARRANQUE — Fase 1.
 *
 * Siembra las cuentas del despacho y un puñado de solicitudes de ejemplo para
 * que el portal no se vea vacío en la demostración. Los ejemplos incluyen
 * casos NO calificados a propósito: son la prueba visible de que el filtro
 * existe, porque no deben aparecer en la tabla de abogados.
 *
 * Al conectar la base real (Fase 2) este módulo se elimina.
 */
import { getStore } from '@/lib/db/store'
import { hashPassword } from '@/lib/auth/password'
import { addDays, nowIso, today } from '@/lib/dates'
import { callDayOptions } from '@/lib/domain/call-slot'
import type { CallSlot } from '@/lib/domain/call-slot'
import { qualifyLead } from '@/lib/domain/qualification'
import type { StateCode } from '@/lib/domain/states'
import type { StaffUser } from '@/lib/domain/types'
import { createLead } from '@/lib/db/leads'

/** Accesos de la demo. Se muestran en /acceso solo mientras dure la Fase 1. */
export const DEMO_CREDENTIALS = [
  {
    name: 'Renata Cárdenas',
    email: 'abogados@sololaboral.demo',
    password: 'SoloLaboral2026',
  },
] as const

interface DemoSubmission {
  fullName: string
  phone: string
  state: StateCode
  daysAgo: number
  description: string
  /** Índice del día ofrecido + franja, para sembrar una llamada pedida. */
  callIn?: { dayIndex: number; slot: CallSlot }
}

/**
 * Los tres últimos reproducen los ejemplos del alcance: fuera de cobertura,
 * despido viejo, y el límite exacto de 60 días (que NO califica).
 */
const DEMO_SUBMISSIONS: DemoSubmission[] = [
  {
    fullName: 'Juan Pérez Villanueva',
    phone: '5541239876',
    state: 'CMX',
    daysAgo: 20,
    description:
      'Trabajaba en un almacén de la colonia Granjas desde hace cuatro años. El lunes me dijeron que ya no me presentara y no me dieron nada por escrito ni liquidación.',
  },
  {
    fullName: 'María Fernanda Solís Aguirre',
    phone: '5528461130',
    state: 'MEX',
    daysAgo: 6,
    description:
      'Me despidieron de una tienda en Ecatepec después de avisar que estaba embarazada. Me ofrecieron dos semanas de sueldo para que firmara mi renuncia y no firmé.',
    // Uno de los ejemplos trae franja pedida: si ninguno la tuviera, la
    // demostración no enseñaría el caso que justifica la función.
    callIn: { dayIndex: 0, slot: 'afternoon' },
  },
  {
    fullName: 'Ricardo Ontiveros Lara',
    phone: '5567012244',
    state: 'CMX',
    daysAgo: 45,
    description:
      'Llevaba once años en la empresa como chofer. Me liquidaron con mucho menos de lo que me tocaba y me hicieron firmar de recibido sin dejarme leer.',
  },
  {
    fullName: 'Alejandra Nava Quintero',
    phone: '9811457023',
    state: 'CAM',
    daysAgo: 10,
    description:
      'Me corrieron de un hotel en Campeche sin pagarme mi finiquito ni las vacaciones que tenía acumuladas.',
  },
  {
    fullName: 'Gustavo Adolfo Rentería Mora',
    phone: '5590033471',
    state: 'CMX',
    daysAgo: 85,
    description:
      'Me despidieron hace casi tres meses de una empresa de seguridad privada y nunca me dieron mi finiquito.',
  },
  {
    fullName: 'Patricia Elizondo Mancera',
    phone: '5512780064',
    state: 'MEX',
    daysAgo: 60,
    description:
      'Me despidieron justo hace dos meses de una maquiladora en Tlalnepantla y no me quisieron dar constancia de nada.',
  },
]

export async function seedIfEmpty(): Promise<void> {
  const store = getStore()
  if (store.seeded) return
  store.seeded = true

  const stamp = nowIso()
  const hashes = await Promise.all(DEMO_CREDENTIALS.map((c) => hashPassword(c.password)))

  const users: StaffUser[] = DEMO_CREDENTIALS.map((c, i) => ({
    id: `usr_demo_${i + 1}`,
    name: c.name,
    email: c.email,
    status: 'active',
    createdAt: stamp,
    lastLoginAt: null,
    passwordHash: hashes[i],
  }))
  store.users.push(...users)

  const submittedOn = today()
  for (const demo of DEMO_SUBMISSIONS) {
    const dismissalDate = addDays(submittedOn, -demo.daysAgo)
    // Los ejemplos pasan por el MISMO motor que los envíos reales: si la regla
    // cambia, la demo cambia con ella y no queda un dato sembrado que mienta.
    const verdict = qualifyLead({
      state: demo.state,
      dismissalDate,
      submittedOn,
    })
    await createLead({
      fullName: demo.fullName,
      phone: demo.phone,
      state: demo.state,
      dismissalDate,
      description: demo.description,
      submittedOn,
      qualificationStatus: verdict.status,
      qualificationReason: verdict.reason,
      dismissalDaysAtSubmission: verdict.dismissalDaysAgo,
      callPreference:
        demo.callIn && verdict.status === 'qualified'
          ? { date: callDayOptions(submittedOn)[demo.callIn.dayIndex], slot: demo.callIn.slot }
          : null,
      isDemo: true,
    })
  }
}
