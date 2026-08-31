/**
 * COLOCACIÓN DE LA REJILLA POR HORAS.
 *
 * Toda la aritmética de la vista de semana y día vive aquí, en minutos y sin
 * tocar el DOM, para poder probarla: dónde empieza y dónde termina cada bloque,
 * y —lo que de verdad cuesta— cómo se reparten el ancho los eventos que caen a
 * la misma hora.
 *
 * El reparto no puede hacerse evento por evento. Si a las 10:00 hay tres citas y
 * cada una decidiera su ancho mirando solo a la que le estorba, quedarían de
 * tamaños distintos y el hueco de la tercera se leería como una cita ausente.
 * Por eso se agrupan en RACIMOS —cadenas de eventos encadenados por traslape— y
 * el racimo entero comparte el mismo número de columnas.
 */

/** Cada cuánto se enganchan el arrastre y las horas capturadas: 15 minutos. */
export const SLOT_MINUTES = 15

/** Lo que dura una actividad si solo se hizo clic, sin arrastrar. */
export const DEFAULT_DURATION_MINUTES = 60

/** Nadie agenda menos de esto; por debajo el bloque no es ni legible ni clicable. */
export const MIN_DURATION_MINUTES = 30

export const MINUTES_PER_DAY = 24 * 60

export interface Placeable {
  id: string
  startMin: number
  endMin: number
}

export interface Placed extends Placeable {
  /** Columna que ocupa dentro de su racimo, empezando en 0. */
  column: number
  /** Columnas que tiene el racimo entero: el denominador del ancho. */
  columns: number
}

/**
 * Reparte en columnas los eventos de UN día.
 *
 * Devuelve los eventos ordenados por hora, cada uno con la columna que le toca y
 * cuántas columnas tiene su racimo. Un evento sin nada encima sale siempre con
 * `columns: 1` y ocupa todo el ancho.
 */
export function layoutDay(items: Placeable[]): Placed[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || (a.id < b.id ? -1 : 1),
  )

  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  // El minuto en que queda libre cada columna del racimo en curso.
  let columnEnds: number[] = []

  const closeCluster = () => {
    const columns = columnEnds.length
    for (const item of cluster) placed.push({ ...item, columns })
    cluster = []
    columnEnds = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    // Se pinta con al menos un minuto de alto: una actividad de duración cero
    // seguiría estorbando a la de la misma hora y tiene que contar como traslape.
    const endMin = Math.max(item.endMin, item.startMin + 1)

    if (cluster.length > 0 && item.startMin >= clusterEnd) closeCluster()

    let column = columnEnds.findIndex((free) => free <= item.startMin)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(endMin)
    } else {
      columnEnds[column] = endMin
    }

    cluster.push({ ...item, column, columns: 0 })
    clusterEnd = Math.max(clusterEnd, endMin)
  }
  if (cluster.length > 0) closeCluster()

  return placed
}

/**
 * El tramo que ocupa un evento dentro del día que se está pintando.
 *
 * `endMin` es lo que se DIBUJA, no lo que se guardó: una actividad sin hora de
 * fin ocupa el mínimo legible, y una que se pasa de la medianoche se corta en el
 * borde del día en vez de desbordar la columna.
 */
export function spanOf(startMin: number, endMin: number | null): { startMin: number; endMin: number } {
  const start = clampMinutes(startMin)
  const raw = endMin === null ? start + MIN_DURATION_MINUTES : endMin
  const end = Math.min(MINUTES_PER_DAY, Math.max(raw, start + MIN_DURATION_MINUTES))
  return { startMin: start, endMin: end }
}

export function clampMinutes(minutes: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)))
}

/** Engancha hacia abajo: el bloque empieza donde se apretó, no después. */
export function snapDown(minutes: number, step = SLOT_MINUTES): number {
  return clampMinutes(Math.floor(clampMinutes(minutes) / step) * step)
}

/** Engancha hacia arriba: al arrastrar, el bloque cubre el hueco recorrido. */
export function snapUp(minutes: number, step = SLOT_MINUTES): number {
  return clampMinutes(Math.ceil(clampMinutes(minutes) / step) * step)
}

/**
 * El tramo que deja un gesto sobre la rejilla.
 *
 * Un clic seco —sin arrastre— vale una hora, que es lo que dura casi todo lo que
 * se agenda aquí. Arrastrar hacia arriba es tan válido como hacia abajo: se
 * ordenan los dos extremos en vez de descartar el gesto. Y nunca se devuelve un
 * tramo que se salga del día, porque la hora de fin se guarda contra el mismo
 * día que la de inicio.
 */
export function draftRange(
  anchorMin: number,
  cursorMin: number,
): { startMin: number; endMin: number } {
  const a = snapDown(Math.min(anchorMin, cursorMin))
  const b = snapUp(Math.max(anchorMin, cursorMin))

  const duration = b - a <= SLOT_MINUTES ? DEFAULT_DURATION_MINUTES : b - a
  const start = Math.min(a, MINUTES_PER_DAY - MIN_DURATION_MINUTES)
  return { startMin: start, endMin: Math.min(MINUTES_PER_DAY, start + Math.max(duration, MIN_DURATION_MINUTES)) }
}
