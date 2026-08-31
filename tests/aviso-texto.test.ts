import { describe, expect, it } from 'vitest'
import {
  avisoCasoCalificado,
  avisoLlamadaAgendada,
  avisoLlamadaInmediata,
} from '@/lib/domain/aviso-texto'

const LEAD = {
  folio: 'SL-000042',
  fullName: 'María Fernanda Solís',
  phone: '5544332211',
  state: 'CMX' as const,
  dismissalDate: '2026-08-20',
  dismissalDaysAtSubmission: 11,
  description: 'Me corrieron sin liquidación después de seis años en la empresa.',
}
const ID = '11111111-1111-1111-1111-111111111111'
const URL = 'https://portal-solo-laboral.vercel.app'

describe('aviso de caso calificado', () => {
  const aviso = avisoCasoCalificado(LEAD, ID, URL)

  it('el asunto basta para saber de quién es sin abrirlo', () => {
    expect(aviso.subject).toContain('María Fernanda Solís')
  })

  it('lleva lo necesario para actuar: a quién llamar y a qué número', () => {
    expect(aviso.text).toContain('55 4433 2211')
    expect(aviso.text).toContain('Ciudad de México')
    expect(aviso.text).toContain('11 días')
    expect(aviso.text).toContain('SL-000042')
  })

  it('NO saca el relato del despido al correo', () => {
    // Es el dato más sensible del expediente y los buzones no los administra
    // nadie. Que exista se dice; qué dice, no: para eso está el portal.
    expect(aviso.text).not.toContain('liquidación')
    expect(aviso.text).toContain('está en el portal')
  })

  it('avisa cuando NO hay descripción, que es lo que cambia la llamada', () => {
    const sin = avisoCasoCalificado({ ...LEAD, description: '' }, ID, URL)
    expect(sin.text).toContain('No escribió descripción')
  })

  it('no promete lo que ningún abogado ha decidido', () => {
    expect(aviso.text).toContain('cumple los criterios iniciales')
    expect(aviso.text.toLowerCase()).not.toContain('aceptado')
  })

  it('enlaza al expediente, y se aguanta sin dominio configurado', () => {
    expect(aviso.text).toContain(`${URL}/portal/${ID}`)
    expect(avisoCasoCalificado(LEAD, ID, '').text).not.toContain('/portal/')
  })
})

describe('aviso de llamada inmediata', () => {
  const aviso = avisoLlamadaInmediata(LEAD, ID, URL, 10)

  it('el asunto empieza por la acción, no por el hecho', () => {
    // Se lee en la pantalla de bloqueo, de pie y entre dos cosas: "Nuevo lead"
    // obligaría a abrirlo para saber si hay que moverse.
    expect(aviso.subject.startsWith('LLAMAR AHORA')).toBe(true)
    expect(aviso.subject).toContain('10 min')
    expect(aviso.subject).toContain('55 4433 2211')
  })

  it('recuerda que la pantalla ya se lo prometió', () => {
    expect(aviso.text).toContain('se lo prometió')
  })
})

describe('aviso de llamada agendada', () => {
  const aviso = avisoLlamadaAgendada(LEAD, ID, URL, '2026-09-03', '4:00 pm')

  it('dice cuándo la pidió', () => {
    expect(aviso.subject).toContain('03/09/2026')
    expect(aviso.subject).toContain('4:00 pm')
  })

  it('no la convierte en una cita confirmada por el despacho', () => {
    expect(aviso.text).toContain('no una cita confirmada por el despacho')
  })
})
