import { beforeEach, describe, expect, it } from 'vitest'

/**
 * LOS IDS SEMBRADOS NO PUEDEN CAMBIAR ENTRE ARRANQUES.
 *
 * El almacén de la Fase 1 vive en memoria y en producción hay muchas
 * instancias, cada una con su propia copia sembrada. Cuando los ids se
 * generaban al vuelo, el listado que pintaba una instancia enlazaba a casos
 * que otra no conocía y el detalle respondía 404.
 *
 * Sembrar dos veces desde cero equivale a dos instancias arrancando por
 * separado: si los ids coinciden, el enlace abre en cualquiera de ellas.
 */
const { resetStore } = await import('@/lib/db/store')
const { ensureSeeded } = await import('@/lib/db')
const { listQualifiedLeads, findQualifiedLeadById } = await import('@/lib/db/leads')

async function freshSeed() {
  resetStore()
  await ensureSeeded()
  return (await listQualifiedLeads()).rows
}

describe('estabilidad de la semilla entre instancias', () => {
  beforeEach(() => {
    resetStore()
  })

  it('dos arranques independientes producen los mismos ids', async () => {
    const first = (await freshSeed()).map((lead) => lead.id)
    const second = (await freshSeed()).map((lead) => lead.id)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
  })

  it('un id obtenido de un arranque abre en el siguiente', async () => {
    const [lead] = await freshSeed()
    // El listado lo sirvió "una instancia"; el detalle cae en otra recién
    // arrancada. Es exactamente el clic que devolvía 404.
    await freshSeed()

    const found = await findQualifiedLeadById(lead.id)
    expect(found).not.toBeNull()
    expect(found?.fullName).toBe(lead.fullName)
  })

  it('los folios de caso tampoco se recorren entre arranques', async () => {
    const first = (await freshSeed()).map((lead) => lead.caseNumber)
    const second = (await freshSeed()).map((lead) => lead.caseNumber)

    expect(first).toEqual(second)
  })
})
