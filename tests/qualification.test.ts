import { describe, expect, it } from 'vitest'
import {
  FutureDismissalDateError,
  RECENCY_LIMIT_DAYS,
  qualifyLead,
} from '@/lib/domain/qualification'
import { MEXICAN_STATES, QUALIFYING_STATES, isQualifyingState } from '@/lib/domain/states'
import { addDays } from '@/lib/dates'
import type { StateCode } from '@/lib/domain/states'

const HOY = '2026-08-21'

function verdict(state: StateCode, daysAgo: number) {
  return qualifyLead({ state, dismissalDate: addDays(HOY, -daysAgo), submittedOn: HOY })
}

describe('motor de calificación', () => {
  it('el límite es 60 días y solo CDMX y Estado de México', () => {
    // Si alguien cambia estas dos constantes cambia el alcance del despacho.
    expect(RECENCY_LIMIT_DAYS).toBe(60)
    expect([...QUALIFYING_STATES]).toEqual(['CMX', 'MEX'])
  })

  it('califica cuando se cumplen LAS DOS condiciones', () => {
    for (const state of QUALIFYING_STATES) {
      const r = verdict(state, 25)
      expect(r.status).toBe('qualified')
      expect(r.reason).toBe('qualified_allowed_state_and_recent_dismissal')
      expect(r.dismissalDaysAgo).toBe(25)
    }
  })

  it('el día 59 califica, el 60 NO y el 61 tampoco', () => {
    // "menos de 60 días" es estricto: el 60 exacto queda fuera.
    expect(verdict('CMX', 59).status).toBe('qualified')
    expect(verdict('CMX', 60).status).toBe('unqualified')
    expect(verdict('CMX', 60).reason).toBe('unqualified_dismissal_date')
    expect(verdict('CMX', 61).status).toBe('unqualified')
  })

  it('un despido de hoy mismo califica', () => {
    const r = verdict('MEX', 0)
    expect(r.dismissalDaysAgo).toBe(0)
    expect(r.status).toBe('qualified')
  })

  it('rechaza cualquier entidad fuera de cobertura, por reciente que sea el despido', () => {
    const fuera = MEXICAN_STATES.map((s) => s.code).filter((c) => !isQualifyingState(c))
    expect(fuera).toHaveLength(30)
    for (const state of fuera) {
      const r = verdict(state, 1)
      expect(r.status).toBe('unqualified')
      expect(r.reason).toBe('unqualified_state')
    }
  })

  it('distingue el motivo cuando fallan las dos condiciones', () => {
    expect(verdict('CAM', 85).reason).toBe('unqualified_state_and_dismissal_date')
  })

  it('reproduce los tres ejemplos del alcance', () => {
    // Campeche, 10 días -> NO CALIFICADO
    expect(verdict('CAM', 10).status).toBe('unqualified')
    // Ciudad de México, 85 días -> NO CALIFICADO
    expect(verdict('CMX', 85).status).toBe('unqualified')
    // Estado de México, 25 días -> CALIFICADO
    expect(verdict('MEX', 25).status).toBe('qualified')
  })

  it('una fecha de despido futura no es "no calificado": es un dato imposible', () => {
    expect(() =>
      qualifyLead({ state: 'CMX', dismissalDate: addDays(HOY, 1), submittedOn: HOY }),
    ).toThrow(FutureDismissalDateError)
  })

  it('cuenta días civiles, sin correrse por zona horaria ni por año bisiesto', () => {
    // Del 1 de enero al 1 de marzo de 2024 (bisiesto) hay 60 días: NO califica.
    const r = qualifyLead({
      state: 'CMX',
      dismissalDate: '2024-01-01',
      submittedOn: '2024-03-01',
    })
    expect(r.dismissalDaysAgo).toBe(60)
    expect(r.status).toBe('unqualified')

    // En un año no bisiesto son 59 días: sí califica.
    const s = qualifyLead({
      state: 'CMX',
      dismissalDate: '2026-01-01',
      submittedOn: '2026-03-01',
    })
    expect(s.dismissalDaysAgo).toBe(59)
    expect(s.status).toBe('qualified')
  })

  it('es determinístico: mismas entradas, mismo resultado', () => {
    const a = verdict('CMX', 30)
    const b = verdict('CMX', 30)
    expect(a).toEqual(b)
  })
})
