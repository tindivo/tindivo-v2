'use client'

import { ApiError } from '@tindivo/api-client'
import { cn, Icon } from '@tindivo/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * Tarjeta que se arrastra: a la derecha AVANZA el pedido, a la izquierda lo
 * SUELTA. Es el motor de todos los gestos de la bandeja (tomar, llegué al
 * local, ya recogí, llegué a la puerta, soltar); cada bandeja le dice qué hace
 * cada dirección y él se ocupa del dedo.
 *
 * NO SUSTITUYE A LA FICHA. Un arrastre no tiene equivalente en teclado ni en
 * lector de pantalla: la ficha, con su barra de abajo, sigue siendo el camino
 * accesible. Esto es un atajo, nunca el único camino.
 *
 * EL COLOR VA AQUÍ Y NO DENTRO DE LA TARJETA porque `OrderCard` lleva
 * `overflow-hidden` para recortar la franja de acento del local: lo que asome
 * por debajo tiene que vivir en un envoltorio.
 *
 * TRES MODOS, según lo que cueste equivocarse:
 *
 *   · `confirm` — TOMAR. Compite con otros motorizados, así que la tarjeta se
 *     queda a medio camino con un spinner hasta que el servidor confirma.
 *   · `optimistic` — llegué, recogí, llegué a la puerta. Solo el dueño del
 *     pedido puede hacerlo, así que casi nunca falla: la tarjeta vuelve a su
 *     sitio AL SOLTAR ya con el paso nuevo pintado, y el POST corre detrás. Si
 *     el servidor rechazara, el paso se deshace y la tarjeta lo dice.
 *   · `open` — no cambia nada por sí mismo: abre una hoja (cobrar, soltar,
 *     confirmar una recogida adelantada). La tarjeta vuelve sola.
 */

export type SwipeTone = 'sky' | 'orange' | 'violet' | 'amber' | 'green' | 'danger'

type FailTone = 'danger' | 'warning'
type Failure = { text: string; tone: FailTone }
type Phase = 'idle' | 'busy' | 'done' | 'failed'

const TONE: Record<SwipeTone, { solid: string; soft: string; ink: string; ring: string }> = {
  sky: {
    solid: 'bg-[linear-gradient(135deg,#0284c7,#0ea5e9)]',
    soft: 'bg-sky-100',
    ink: 'text-sky-800',
    ring: '#0ea5e9',
  },
  orange: {
    solid: 'bg-[linear-gradient(135deg,#ea580c,#f97316)]',
    soft: 'bg-orange-100',
    ink: 'text-orange-800',
    ring: '#f97316',
  },
  violet: {
    solid: 'bg-[linear-gradient(135deg,#6d28d9,#8b5cf6)]',
    soft: 'bg-violet-100',
    ink: 'text-violet-800',
    ring: '#8b5cf6',
  },
  amber: {
    solid: 'bg-[linear-gradient(135deg,#d97706,#f59e0b)]',
    soft: 'bg-amber-100',
    ink: 'text-amber-900',
    ring: '#f59e0b',
  },
  green: {
    solid: 'bg-[linear-gradient(135deg,#16a34a,#22c55e)]',
    soft: 'bg-success-soft',
    ink: 'text-success',
    ring: '#22c55e',
  },
  danger: {
    solid: 'bg-[linear-gradient(135deg,#dc2626,#ef4444)]',
    soft: 'bg-danger-soft',
    ink: 'text-danger',
    ring: '#ef4444',
  },
}

export interface RightAction {
  mode: 'confirm' | 'optimistic' | 'open'
  verb: string
  icon: string
  tone: SwipeTone
  /**
   * Lo que hace el gesto. En `optimistic` debe PINTAR el paso nuevo antes de su
   * primer `await`: se llama al soltar y la tarjeta ya no espera.
   */
  commit: () => Promise<void> | void
  /** Texto mientras el servidor contesta (`confirm`). */
  doing?: string
  /** Texto del visto final (`confirm`). */
  done?: string
  /** Se llama al soltar, con el gesto aún caliente: el audio del navegador lo exige. */
  armSound?: () => () => void
  /** `confirm`: se llama cuando la fila ya colapsó. */
  onDone?: () => void
  /** Personaliza el mensaje de fallo. Si devuelve `null`, se usa el genérico. */
  failure?: (err: unknown) => (Failure & { after?: () => void }) | null
}

export interface LeftAction {
  verb: string
  icon: string
  tone: SwipeTone
  /** Abre lo que haga falta; la tarjeta vuelve sola. */
  onCommit: () => void
}

/** Se enseña una vez por sesión y por bandeja, y solo en la primera tarjeta. */
const DEFAULT_HINT_KEY = 'tindivo.drv.swipehint.v1'

/** Casi media tarjeta: un pedido no avanza sin querer. */
const THRESHOLD = 0.45
const LEFT_THRESHOLD = 0.4

/** Dónde se queda la tarjeta mientras el servidor contesta. */
const COMMIT_X = 108

/** Dónde aguanta para que se lea el motivo del fallo. */
const FAIL_X = 148

/**
 * Los primeros píxeles no deciden nada. Pasados, gana el eje dominante: si es
 * horizontal el gesto es nuestro, si es vertical se lo queda el scroll. Sin este
 * candado, bajar por la bandeja con el dedo algo torcido arrastra la tarjeta.
 */
const AXIS_SLOP = 6

function genericFailure(err: unknown): Failure {
  if (err instanceof ApiError) {
    return { text: err.problem.detail ?? 'No se pudo completar', tone: 'danger' }
  }
  return { text: 'Sin conexión · vuelve a intentar', tone: 'warning' }
}

function buzz(ms: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms)
  }
}

export function SwipeCard({
  right,
  left,
  hint = false,
  hintKey = DEFAULT_HINT_KEY,
  onTouch,
  children,
}: {
  right?: RightAction
  left?: LeftAction
  hint?: boolean
  hintKey?: string
  /**
   * Se llama en cuanto el dedo toca la tarjeta, antes de saber si será un
   * gesto. Sirve para ir pidiendo lo que la hoja va a necesitar: el arrastre
   * dura lo que tarda la respuesta, y así ya está cuando se suelta.
   */
  onTouch?: () => void
  children: ReactNode
}) {
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<Failure | null>(null)
  /** 0 nada · 1 recién montado (invisible) · 2 visible. Es el visto tras un paso. */
  const [pop, setPop] = useState<{ step: 0 | 1 | 2; ring: string }>({ step: 0, ring: '#22c55e' })

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
  // una vez por sesión. Con `prefers-reduced-motion` no se mueve nada.
  useEffect(() => {
    if (!hint || !right) return
    try {
      if (sessionStorage.getItem(hintKey)) return
      sessionStorage.setItem(hintKey, '1')
    } catch {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    later(() => setX(22), 420)
    later(() => setX(0), 1020)
  }, [hint, hintKey, right])

  function fail(f: Failure, after?: () => void) {
    setFailure(f)
    setPhase('failed')
    setX(FAIL_X)
    later(() => {
      setX(0)
      setPhase('idle')
      setFailure(null)
      after?.()
    }, 1500)
  }

  function celebrate(ring: string) {
    setPop({ step: 1, ring })
    later(() => setPop({ step: 2, ring }), 30)
    later(() => setPop({ step: 0, ring }), 900)
  }

  async function commitRight(action: RightAction) {
    const sound = action.armSound?.()

    if (action.mode === 'open') {
      buzz(14)
      setX(0)
      void action.commit()
      return
    }

    if (action.mode === 'optimistic') {
      // El paso nuevo se pinta DENTRO de `commit`, antes de su primer await, así
      // que cuando la tarjeta vuelve ya trae el estado siguiente.
      buzz([12, 40, 12])
      sound?.()
      setX(0)
      celebrate(TONE[action.tone].ring)
      try {
        await action.commit()
      } catch (err) {
        const custom = action.failure?.(err)
        const f = custom ?? genericFailure(err)
        fail(f, custom?.after)
      }
      return
    }

    // `confirm`
    setPhase('busy')
    setX(COMMIT_X)
    try {
      await action.commit()
      sound?.()
      buzz([12, 40, 12])
      setPhase('done')
      setX(width.current)
      // La fila colapsa primero y el board se entera después: si se refresca
      // antes, la tarjeta se esfuma sin que se llegue a leer el visto.
      later(() => action.onDone?.(), 420)
    } catch (err) {
      const custom = action.failure?.(err)
      fail(custom ?? genericFailure(err), custom?.after)
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
    onTouch?.()
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

    // Cada dirección existe solo si la bandeja le dio una acción: sin ella la
    // tarjeta no cede ni un píxel, en vez de prometer algo que no va a pasar.
    const next = Math.max(left ? -width.current : 0, Math.min(right ? width.current : 0, dx))
    setX(next)

    const limit = next >= 0 ? THRESHOLD : LEFT_THRESHOLD
    const ahora = Math.abs(next) >= width.current * limit
    if (ahora !== armed.current) {
      armed.current = ahora
      if (ahora) buzz(10)
    }
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (axis.current !== 'x') {
      setX(0)
      return
    }
    if (right && x >= width.current * THRESHOLD) {
      void commitRight(right)
    } else if (left && x <= -width.current * LEFT_THRESHOLD) {
      buzz(14)
      setX(0)
      left.onCommit()
    } else {
      setX(0)
    }
  }

  const goingLeft = x < 0
  const active = goingLeft ? left : right
  const tone =
    TONE[failure ? (failure.tone === 'warning' ? 'amber' : 'danger') : (active?.tone ?? 'green')]
  const limit = goingLeft ? LEFT_THRESHOLD : THRESHOLD
  const progress = Math.min(1, Math.abs(x) / (width.current * limit))
  const armedNow = phase === 'busy' || phase === 'done' || progress >= 1
  const failed = phase === 'failed'

  const label = failed
    ? (failure?.text ?? '')
    : phase === 'done'
      ? (right?.done ?? '')
      : phase === 'busy'
        ? (right?.doing ?? '')
        : (active?.verb ?? '')

  const icon = failed
    ? failure?.tone === 'warning'
      ? 'cloud_off'
      : 'person_off'
    : phase === 'done'
      ? 'check_circle'
      : (active?.icon ?? 'check_circle')

  const revealBg = failed ? tone.soft : armedNow ? tone.solid : tone.soft
  const revealInk = failed ? tone.ink : armedNow ? 'text-white' : tone.ink

  return (
    <div
      data-swipe-card
      className="relative touch-pan-y select-none overflow-hidden rounded-2xl transition-[max-height,opacity] duration-200 ease-out"
      style={{ maxHeight: phase === 'done' ? 0 : 900, opacity: phase === 'done' ? 0 : 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Si hubo arrastre, el `click` que viene detrás es el del botón invisible
      // que cubre la tarjeta (`order-card.tsx`). Sin tragárselo se avanza el
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
          'absolute inset-0 flex items-center gap-2.5 rounded-2xl transition-colors duration-200',
          goingLeft && !failed ? 'flex-row-reverse pr-[22px]' : 'pl-[22px]',
          revealBg,
        )}
      >
        {phase === 'busy' ? (
          // Spinner en CSS: `progress_activity` no está en la fuente recortada de
          // la app y salía como texto roto girando.
          <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
        ) : (
          <span
            className={cn('shrink-0 transition-transform duration-150', revealInk)}
            style={{ transform: `scale(${0.72 + 0.28 * progress})` }}
          >
            <Icon name={icon} size={26} filled />
          </span>
        )}
        <span
          className={cn('text-body-lg font-bold leading-tight tracking-tight', revealInk)}
          style={{ opacity: failed || phase !== 'idle' ? 1 : Math.min(1, progress * 1.4) }}
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

      {/* El visto que se queda un instante tras un paso: la tarjeta ya cambió,
          y esto es lo que dice «sí, fue este gesto». */}
      {pop.step > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl transition-opacity duration-150"
          style={{
            boxShadow: `inset 0 0 0 3px ${pop.ring}`,
            opacity: pop.step === 2 ? 1 : 0,
          }}
        >
          <span
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              backgroundColor: pop.ring,
              transform: pop.step === 2 ? 'scale(1)' : 'scale(0.4)',
            }}
          >
            <Icon name="check" size={22} filled />
          </span>
        </span>
      )}
    </div>
  )
}
