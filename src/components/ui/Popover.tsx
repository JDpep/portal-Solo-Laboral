'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

/**
 * EL PUNTO DE LA PANTALLA DEL QUE CUELGA EL POPOVER.
 *
 * Se toma de lo que se tocó —una celda, un bloque de la rejilla, un botón— en
 * coordenadas de ventana (`getBoundingClientRect`), no de documento: el popover
 * se posiciona `fixed` y así no hay que restarle el scroll.
 */
export interface Anchor {
  x: number
  y: number
  width?: number
  height?: number
}

export function anchorFromElement(el: Element): Anchor {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

export function anchorFromPoint(x: number, y: number): Anchor {
  return { x, y, width: 0, height: 0 }
}

const GAP = 8
const WIDE_ENOUGH = 640 // el `sm` de Tailwind

/**
 * POPOVER ANCLADO.
 *
 * Sale al lado de lo que se tocó, como el globo de Google Calendar: agendar una
 * cita no debería tapar la rejilla que uno estaba leyendo para decidir la hora.
 *
 * En pantalla angosta no hay "al lado" que valga —un globo de 380px sobre un
 * teléfono acaba pegado a un borde— así que baja como hoja anclada abajo, donde
 * llega el pulgar.
 *
 * Se va con Escape y tocando fuera. Lo que hay dentro es un formulario a medio
 * llenar, así que el clic de fuera se escucha en `pointerdown` sobre el velo y
 * no en cualquier clic del documento: así un arrastre que empieza dentro y
 * termina fuera —seleccionar texto de un campo— no lo cierra.
 */
export function Popover({
  anchor,
  onClose,
  label,
  children,
  width = 380,
}: {
  anchor: Anchor
  onClose: () => void
  label: string
  children: React.ReactNode
  width?: number
}) {
  // El nodo se guarda en estado y no en una ref: colocar el globo depende de
  // medirlo, y una ref no avisa cuando por fin existe —el portal no monta en la
  // primera pasada— así que el cálculo se quedaría sin correr y el globo,
  // invisible para siempre.
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    setMounted(true)
    const check = () => setSheet(window.innerWidth < WIDE_ENOUGH)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  /**
   * Se coloca a la derecha del ancla; si no cabe, a la izquierda; si tampoco,
   * centrado. En vertical se sube lo necesario para que el borde inferior
   * —donde vive el botón de guardar— quede dentro de la ventana.
   */
  const place = useCallback(() => {
    if (!card || sheet) return
    const { width: w, height: h } = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = anchor.x + (anchor.width ?? 0) + GAP
    if (left + w > vw - GAP) left = anchor.x - w - GAP
    if (left < GAP) left = Math.max(GAP, (vw - w) / 2)

    let top = anchor.y - 16
    if (top + h > vh - GAP) top = vh - h - GAP
    if (top < GAP) top = GAP

    setPos({ left, top })
  }, [anchor, sheet, card])

  useLayoutEffect(() => {
    place()
  }, [place])

  // El contenido crece al desplegar la nota: hay que recolocar o el pie se sale.
  useEffect(() => {
    if (!card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => place())
    observer.observe(card)
    return () => observer.disconnect()
  }, [card, place])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // El foco entra al popover en cuanto abre: quien navega con teclado no debería
  // tener que buscar a tientas el campo del título.
  useEffect(() => {
    if (!card) return
    const target = card.querySelector<HTMLElement>('[data-autofocus]')
    ;(target ?? card).focus({ preventScroll: true })
  }, [card])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={clsx('absolute inset-0', sheet && 'bg-sl-text/20')}
        onPointerDown={onClose}
        aria-hidden
      />
      <div
        ref={setCard}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={clsx(
          'sl-card sl-in absolute max-h-[85vh] overflow-y-auto shadow-lg outline-none',
          sheet
            ? 'inset-x-3 bottom-3'
            : 'w-[--pop-w] max-w-[calc(100vw-1rem)]',
          !sheet && pos === null && 'invisible',
        )}
        style={
          sheet
            ? undefined
            : ({ left: pos?.left ?? 0, top: pos?.top ?? 0, '--pop-w': `${width}px` } as React.CSSProperties)
        }
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
