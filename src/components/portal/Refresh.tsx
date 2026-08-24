'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCw } from 'lucide-react'
import clsx from 'clsx'

/**
 * ESTADO DE REVALIDACIÓN DEL PORTAL.
 *
 * Buscar, reordenar y actualizar son tres controles distintos que producen el
 * mismo hecho —la lista se está volviendo a pedir al servidor— y ese hecho hay
 * que contarlo UNA sola vez y en un solo lugar, no con tres hilanderas
 * distintas girando en tres esquinas.
 *
 * Cada control anuncia aquí su `isPending`; el proveedor lleva la cuenta y
 * expone si hay algo en vuelo. Con eso se pinta la barra de arriba y se atenúa
 * la lista, y todo se apaga a la vez cuando llega la respuesta.
 */
interface RefreshState {
  pending: boolean
  /** Registra el pendiente de un control. Devuelve la función para retirarlo. */
  hold: () => () => void
}

const Ctx = createContext<RefreshState>({ pending: false, hold: () => () => {} })

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0)

  const hold = useCallback(() => {
    setCount((n) => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setCount((n) => Math.max(0, n - 1))
    }
  }, [])

  const value = useMemo(() => ({ pending: count > 0, hold }), [count, hold])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Conecta el `isPending` de un `useTransition` local al estado compartido.
 * Sin proveedor alrededor no hace nada, así que los controles siguen sirviendo
 * fuera del portal.
 */
export function useReportPending(pending: boolean): void {
  const { hold } = useContext(Ctx)
  useEffect(() => {
    if (!pending) return
    return hold()
  }, [pending, hold])
}

/**
 * Barra indeterminada bajo el filete de marca.
 *
 * Se queda montada siempre y solo cambia de opacidad: montarla y desmontarla
 * la hacía aparecer de golpe en las revalidaciones de 80ms, que es justo el
 * parpadeo que se siente como un salto.
 */
export function PendingBar() {
  const { pending } = useContext(Ctx)
  return (
    <div
      aria-hidden
      className={clsx(
        'pointer-events-none fixed inset-x-0 top-1 z-30 h-0.5 overflow-hidden transition-opacity duration-200',
        pending ? 'opacity-100' : 'opacity-0',
      )}
    >
      {pending ? (
        <div
          className="h-full w-1/3 bg-gradient-to-r from-sl-secondary to-sl-accent"
          style={{ animation: 'sl-bar 1.1s var(--sl-ease) infinite' }}
        />
      ) : null}
    </div>
  )
}

/** Atenúa lo que envuelve mientras algo se revalida, sin vaciarlo. */
export function RefreshDim({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(Ctx)
  return <div className={pending ? 'sl-refreshing' : 'sl-settled'}>{children}</div>
}

/**
 * Botón de actualizar.
 *
 * `router.refresh()` vuelve a pedir el árbol de servidor SIN perder el estado
 * del cliente ni la posición del scroll — la diferencia con recargar la página,
 * que es lo único que había antes para ver si entró un caso nuevo.
 *
 * Al terminar deja una palomita un segundo. Sin ella, una revalidación rápida
 * que no cambia nada es indistinguible de un botón roto.
 */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const wasPending = useRef(false)
  useReportPending(pending)

  useEffect(() => {
    if (wasPending.current && !pending) {
      setDone(true)
      const t = setTimeout(() => setDone(false), 1400)
      return () => clearTimeout(t)
    }
    wasPending.current = pending
  }, [pending])

  return (
    <button
      type="button"
      className="sl-btn-secondary px-3 sm:px-4"
      disabled={pending}
      onClick={() => {
        wasPending.current = true
        startTransition(() => router.refresh())
      }}
    >
      {done ? (
        <Check className="sl-in-fade h-4 w-4 text-sl-success" aria-hidden />
      ) : (
        <RotateCw className={clsx('h-4 w-4', pending && 'animate-spin')} aria-hidden />
      )}
      <span className="hidden sm:inline">
        {pending ? 'Actualizando…' : done ? 'Al día' : 'Actualizar'}
      </span>
      {/* El estado se anuncia aunque el rótulo esté oculto en móvil. */}
      <span className="sr-only" role="status">
        {pending ? 'Actualizando la lista' : done ? 'Lista actualizada' : ''}
      </span>
    </button>
  )
}
