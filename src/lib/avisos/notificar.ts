/**
 * AVISOS AL DESPACHO — SIN TRANSPORTE TODAVÍA.
 *
 * EL PROBLEMA QUE RESUELVEN, que sigue abierto: un caso calificado aparece en
 * /portal y ya. Si nadie abre el portal, nadie se entera — y desde que existe
 * "que me llamen en los próximos 10 a 15 minutos", la pantalla promete un plazo
 * corto en nombre del despacho que hoy no recibe nadie.
 *
 * POR QUÉ ESTÁ VACÍO. El canal del despacho es WhatsApp, no el correo. Y que el
 * sistema ENVÍE un WhatsApp es lo contrario de lo que hay hoy: los enlaces
 * `wa.me` los abre el prospecto, y eso no necesita API porque la conversación la
 * inicia él. Un aviso lo inicia el negocio, y eso solo se puede hacer con la
 * WhatsApp Business Platform y una PLANTILLA APROBADA por Meta. Hace falta
 * cuenta de Meta Business, un número dedicado —uno dado de alta en la API deja
 * de servir en la app normal, así que conviene uno nuevo y no tocar el que ya
 * reciben de los prospectos— y esperar la aprobación.
 *
 * QUÉ FALTA PARA ENCENDERLO: escribir el transporte aquí. Los tres momentos ya
 * están enganchados en `src/app/solicitud/actions.ts` y el contenido ya está
 * decidido y probado en `src/lib/domain/aviso-texto.ts`. Es un archivo.
 *
 * LO QUE NO SE PUEDE PERDER AL ENCHUFARLO: esto es "mejor esfuerzo". Si el
 * proveedor falla o tarda, la solicitud SE GUARDA IGUAL. El formulario es la
 * puerta de entrada de alguien que acaba de perder su trabajo, y perder su caso
 * por un problema de mensajería sería el peor fallo posible. Y se espera con
 * plazo, abortando de verdad: en serverless una petición en vuelo cuando la
 * respuesta ya salió se queda colgada al congelarse la instancia.
 */
import type { Lead } from '@/lib/domain/types'

/** Entró un caso que pasa el filtro. */
export async function avisarCasoCalificado(_lead: Lead): Promise<void> {
  // Sin transporte configurado. Ver el bloque de arriba.
}

/** Pidió que le llamen en los próximos minutos: es el urgente de los tres. */
export async function avisarLlamadaInmediata(_lead: Lead, _minutos: number): Promise<void> {
  // Sin transporte configurado.
}

/** Eligió día y hora. */
export async function avisarLlamadaAgendada(
  _lead: Lead,
  _dia: string,
  _hora: string,
): Promise<void> {
  // Sin transporte configurado.
}
