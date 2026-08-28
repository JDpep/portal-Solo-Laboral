import { describe, expect, it } from 'vitest'
import { buildWhatsAppMessage, buildWhatsAppUrl } from '@/lib/domain/whatsapp'
import { DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/config/contact'

/**
 * EL MENSAJE PRELLENADO.
 *
 * Se prueba como función pura porque es texto que va a salir del sistema hacia
 * la conversación de una persona real: una vez enviado por WhatsApp no se
 * recoge, así que lo que lleva —y sobre todo lo que NO lleva— tiene que estar
 * fijado por una prueba y no por la memoria de quien lo escribió.
 */
const JUAN = {
  fullName: 'Juan Pérez Villanueva',
  state: 'MEX' as const,
  dismissalDaysAtSubmission: 18,
  folio: 'SL-000184',
}

describe('mensaje de WhatsApp', () => {
  it('lleva nombre, entidad, días desde el despido y folio', () => {
    const message = buildWhatsAppMessage(JUAN, DEFAULT_WHATSAPP_TEMPLATE)

    expect(message).toContain('Juan Pérez Villanueva')
    expect(message).toContain('Estado de México')
    expect(message).toContain('18 días')
    expect(message).toContain('SL-000184')
  })

  it('usa el nombre de la entidad, no su clave interna', () => {
    const cdmx = buildWhatsAppMessage({ ...JUAN, state: 'CMX' }, DEFAULT_WHATSAPP_TEMPLATE)
    expect(cdmx).toContain('Ciudad de México')
    // 'CMX' es una clave de base de datos; en un mensaje de WhatsApp no
    // significa nada para quien lo lee.
    expect(cdmx).not.toContain('CMX')
  })

  it('NO afirma que el caso fue aceptado', () => {
    const message = buildWhatsAppMessage(JUAN, DEFAULT_WHATSAPP_TEMPLATE).toLowerCase()
    // Calificar significa que cumple los criterios iniciales. La decisión
    // sigue siendo del despacho, y este mensaje lo escribe la persona: no
    // puede comprometer a Solo Laboral con algo que nadie ha decidido.
    for (const frase of ['fue aceptado', 'aceptaron mi caso', 'ya soy cliente', 'caso válido']) {
      expect(message).not.toContain(frase)
    }
  })

  it('es neutro: no inventa el género de quien escribe', () => {
    const message = buildWhatsAppMessage(JUAN, DEFAULT_WHATSAPP_TEMPLATE)
    // El formulario no pregunta el género y no vamos a pedirlo solo para poder
    // conjugar. "Mi despido ocurrió" resuelve el problema sin inventar nada.
    expect(message).not.toMatch(/despedid[oa]/i)
    expect(message).toContain('Mi despido ocurrió')
  })

  it('usa los días congelados al momento del envío', () => {
    const message = buildWhatsAppMessage(
      { ...JUAN, dismissalDaysAtSubmission: 3 },
      DEFAULT_WHATSAPP_TEMPLATE,
    )
    expect(message).toContain('hace 3 días')
    // El folio SL-000184 también lleva un 18: lo que no puede aparecer es el
    // número de días viejo, no la cifra suelta.
    expect(message).not.toContain('hace 18 días')
  })

  it('una plantilla propia sustituye los mismos marcadores', () => {
    const message = buildWhatsAppMessage(JUAN, 'Soy {full_name}, folio {folio}, {dismissal_days}d')
    expect(message).toBe('Soy Juan Pérez Villanueva, folio SL-000184, 18d')
  })
})

describe('enlace de WhatsApp', () => {
  it('apunta a wa.me con el número del despacho y el mensaje codificado', () => {
    const url = buildWhatsAppUrl('525512345678', 'Hola, soy Juan & Ana')
    expect(url.startsWith('https://wa.me/525512345678?text=')).toBe(true)
    // El ampersand codificado: si viajara crudo, partiría la URL y todo lo que
    // viniera detrás se leería como otro parámetro.
    expect(url).toContain('Juan%20%26%20Ana')
  })

  it('acepta el número con separadores y se queda con los dígitos', () => {
    expect(buildWhatsAppUrl('+52 55 1234 5678', 'hola')).toContain('wa.me/525512345678')
  })

  it('rechaza un número que no es marcable', () => {
    // Mejor un error ruidoso que una conversación abierta con nadie.
    expect(() => buildWhatsAppUrl('123', 'hola')).toThrow(/no es válido/i)
    expect(() => buildWhatsAppUrl('', 'hola')).toThrow()
  })
})
