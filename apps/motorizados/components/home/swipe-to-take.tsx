'use client'

import { ApiError } from '@tindivo/api-client'
import { cn, Icon } from '@tindivo/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { postTransition } from '@/lib/transitions'

/**
 * Arrastrar la tarjeta a la derecha para tomar el pedido.
 *
 * POR QUÉ EXISTE. Tomar costaba tres toques y una carga de página: tocar la
 * tarjeta, esperar la ficha, pulsar «Tomar pedido». De noche, con casco y el
 * teléfono en una mano, eso es mucho para una decisión que casi siempre ya está
 * tomada al leer la tarjeta.
 *
 * NO SUSTITUYE A LA FICHA, y aquí eso pesa el doble: un arrastre no tiene
 * equivalente en teclado ni en lector de pantalla, así que la ficha ES el camino
 * accesible. Se sigue llegando con un toque, como siempre, y allí está el botón
 * de verdad. Este componente es un atajo, nunca el único camino.
 *
 * EL VERDE VA AQUÍ Y NO DENTRO DE LA TARJETA porque `OrderCard` lleva
 * `overflow-hidden` — lo necesita para recortar la franja de acento del local—,
 * así que cualquier cosa que asome por debajo tiene que vivir en un envoltorio.
 * Ese envoltorio es además el que colapsa cuando el pedido se va.
 */

type Phase = 'idle' | 'busy' | 'done' | 'failed'
type FailTone = 'danger' | 'warning'

/** Se enseña una vez por sesión, y solo en la primera tarjeta tomable. */
const HINT_KEY = 'tindivo.drv.swipehint.v1'

/** Media tarjeta. Un pedido no se toma sin querer. */
const THRESHOLD = 0.45

/** Dónde se queda la tarjeta mientras el servidor contesta. */
const COMMIT_X = 108

/** Dónde aguanta para que se lea el motivo del fallo. */
const FAIL_X = 148

/**
 * Los primeros píxeles no deciden nada. Pasados, gana el eje dominante: si es
 * horizontal el gesto es nuestro, si es vertical se lo queda el scroll de la
 * lista. Sin este candado, bajar por la bandeja con el dedo algo torcido
 * arrastra la tarjeta de debajo.
 */
const AXIS_SLOP = 6

export function SwipeToTake({
  orderId,
  onTaken,
  hint = false,
  children,
}: {
  orderId: string
  /** Refresca el board: el pedido ya no pertenece a esta bandeja. */
  onTaken: () => void
  hint?: boolean
  children: ReactNode
}) {
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<{ text: string; tone: FailTone } | null>(null)

  const start = useRef({ x: 0, y: 0 })
  const axis = useRef<'x' | 'y' | null>(null)
  const dragged = useRef(false)
  const armed = useRef(false)
  const width = useRef(1)
  const timers = useRef<number[]>([])

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) clearTimeout(t)
    }
  }, [])

  // UN GESTO SIN MANDO NO SE DESCUBRE. La primera tarjeta asoma sola y vuelve,
  // una vez por sesión: lo justo para que se vea que hay algo debajo. Con
  // `prefers-reduced-motion` no se mueve nada — el atajo sigue estando, y quien
  // no lo descubra tiene la ficha de siempre.
  useEffect(() => {
    if (!hint) return
    try {
      if (sessionStorage.getItem(HINT_KEY)) return
      sessionStorage.setItem(HINT_KEY, '1')
    } catch {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    later(() => setX(22), 420)
    later(() => setX(0), 1020)
  }, [hint])

  async function take() {
    setPhase('busy')
    setX(COMMIT_X)
    try {
      await postTransition(orderId, 'take')
      setPhase('done')
      setX(width.current)
      // La fila colapsa primero y el board se entera después: si se refresca
      // antes, la tarjeta se esfuma sin que se llegue a leer el visto.
      later(onTaken, 420)
    } catch (err) {
      const problema = err instanceof ApiError
      setFailure(
        !problema
          ? { text: 'Sin conexión · vuelve a intentar', tone: 'warning' }
          : err.status === 409
            ? { text: 'Lo tomó otro motorizado', tone: 'danger' }
            : { text: err.problem.detail ?? 'No se pudo tomar', tone: 'danger' },
      )
      setPhase('failed')
      setX(FAIL_X)
      later(() => {
        setX(0)
        setPhase('idle')
        setFailure(null)
        // Si se lo llevó otro, la tarjeta sobra en esta bandeja.
        if (problema && err.status === 409) onTaken()
      }, 1400)
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'idle') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    axis.current = null
    dragged.current = false
    armed.current = false
    width.current = e.currentTarget.getBoundingClientRect().width || 1
    setDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || phase !== 'idle') return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y

    if (axis.current === null) {
      if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') {
        dragged.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Sin captura el move sigue llegando mientras el dedo no se salga.
        }
      }
    }
    if (axis.current !== 'x') return

    const next = Math.max(0, Math.min(width.current, dx))
    setX(next)

    const ahora = next >= width.current * THRESHOLD
    if (ahora !== armed.current) {
      armed.current = ahora
      if (ahora && typeof navigator.vibrate === 'function') navigator.vibrate(10)
    }
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (axis.current === 'x' && x >= width.current * THRESHOLD) void take()
    else setX(0)
  }

  const armedNow = phase === 'busy' || phase === 'done' || x >= width.current * THRESHOLD
  const failed = phase === 'failed'
  const progress = Math.min(1, x / (width.current * THRESHOLD))

  const revealBg = failed
    ? failure?.tone === 'warning'
      ? 'bg-warning-soft'
      : 'bg-danger-soft'
    : armedNow
      ? 'bg-[linear-gradient(135deg,#16a34a,#22c55e)]'
      : 'bg-success-soft'

  const revealInk = failed
    ? failure?.tone === 'warning'
      ? 'text-amber-900'
      : 'text-danger'
    : armedNow
      ? 'text-white'
      : 'text-success'

  const label = failed
    ? (failure?.text ?? '')
    : phase === 'done'
      ? 'Es tuyo'
      : phase === 'busy'
        ? 'Tomando…'
        : 'Tomar'

  return (
    <div
      className="relative touch-pan-y select-none overflow-hidden rounded-2xl transition-[max-height,opacity] duration-200 ease-out"
      style={{ maxHeight: phase === 'done' ? 0 : 640, opacity: phase === 'done' ? 0 : 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Si hubo arrastre, el `click` que viene detrás es el del botón invisible
      // que cubre la tarjeta (`order-card.tsx`). Sin tragárselo se toma el
      // pedido Y se navega a la ficha.
      onClickCapture={(e) => {
        if (!dragged.current) return
        e.preventDefault()
        e.stopPropagation()
        dragged.current = false
      }}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center gap-2.5 rounded-2xl pl-[22px] transition-colors duration-200',
          revealBg,
        )}
      >
        {phase === 'busy' ? (
          <Icon name="progress_activity" size={26} className={cn('animate-spin', revealInk)} />
        ) : (
          <span
            className={cn('shrink-0 transition-transform duration-150', revealInk)}
            style={{ transform: `scale(${0.72 + 0.28 * progress})` }}
          >
            <Icon
              name={
                failed ? (failure?.tone === 'warning' ? 'wifi_off' : 'person_off') : 'check_circle'
              }
              size={26}
              filled={!failed}
            />
          </span>
        )}
        <span
          className={cn('text-body-lg font-bold leading-tight tracking-tight', revealInk)}
          style={{ opacity: failed ? 1 : Math.min(1, progress * 1.4) }}
        >
          {label}
        </span>
      </span>

      <div
        style={{
          transform: `translateX(${x}px)`,
          transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
