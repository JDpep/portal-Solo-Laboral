import type { EventType } from '@/lib/domain/types'

/**
 * EL COLOR DE CADA TIPO DE ACTIVIDAD.
 *
 * Vive en un solo sitio porque las tres vistas lo usan: el punto de la celda del
 * mes, el filete del bloque de la semana y la pastilla del día tienen que
 * significar lo mismo. Dos tablas de color separadas se desincronizan a la
 * primera actividad nueva, y entonces el ámbar querría decir "audiencia" en una
 * pantalla y "vencimiento" en otra.
 *
 * El color nunca va solo: cada bloque lleva además su hora y su título, y la
 * leyenda de abajo lo traduce. Quien no distingue el ámbar del rojo tiene que
 * poder leer la agenda igual.
 */
export const EVENT_DOT: Record<EventType, string> = {
  call: 'bg-sl-secondary-strong',
  hearing: 'bg-sl-warning',
  conciliation: 'bg-sl-warning',
  meeting: 'bg-sl-primary',
  follow_up: 'bg-sl-muted',
  deadline: 'bg-sl-danger',
  other: 'bg-sl-muted',
}

/** Fondo, filete izquierdo y color de texto del bloque en la rejilla por horas. */
export const EVENT_BLOCK: Record<EventType, string> = {
  call: 'bg-sl-secondary-strong/10 border-l-sl-secondary-strong text-sl-secondary-strong',
  hearing: 'bg-sl-warning/10 border-l-sl-warning text-sl-warning',
  conciliation: 'bg-sl-warning/10 border-l-sl-warning text-sl-warning',
  meeting: 'bg-sl-primary/10 border-l-sl-primary text-sl-primary',
  follow_up: 'bg-sl-muted/10 border-l-sl-muted text-sl-muted',
  deadline: 'bg-sl-danger/10 border-l-sl-danger text-sl-danger',
  other: 'bg-sl-muted/10 border-l-sl-muted text-sl-muted',
}
