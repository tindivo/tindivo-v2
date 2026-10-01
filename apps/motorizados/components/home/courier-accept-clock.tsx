'use client'

import { cn, Icon } from '@tindivo/ui'
import { useNow } from '@/hooks/use-now'
import { mmss } from '@/lib/format'

/**
 * Desde aquí el reloj se pone rojo y la tarjeta avisa que se va a cancelar.
 * Cinco minutos y no tres, por pedido de operación: con tres el aviso
 * llegaba tarde.
 * El seguimiento del cliente usa el mismo umbral (`accept-countdown.tsx`).
 */
export const COURIER_LATE_SEC = 5 * 60

/**
 * Cuánto le queda a una entrega sin aceptar antes de cancelarse sola.
 *
 * EL MISMO NÚMERO QUE VE EL CLIENTE. Los dos relojes salen del mismo plazo
 * (`created_at` + `timers.courierAcceptMinutes`): aquí por `acceptDeadline` del
 * tablero y en el seguimiento por `get_courier_tracking` (0236). Así nadie
 * discute en la puerta: si el motorizado ve 02:10, el cliente también.
 *
 * Mismo idioma que el reloj de la comida (`OrderCard`): mono, en negro mientras
 * hay tiempo y en rojo con el «!» al final, para que la alarma no dependa solo
 * del color.
 */
export function CourierAcceptClock({
  deadline,
  onDark = false,
}: {
  deadline: string
  /** Sobre el hero oscuro de la ficha: el negro pasa a blanco. */
  onDark?: boolean
}) {
  const now = useNow()
  const left = Math.max(0, Math.round((Date.parse(deadline) - now) / 1000))
  const late = left <= COURIER_LATE_SEC

  if (left === 0) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-caption font-semibold text-ink-muted">
        <Icon name="hourglass_top" size={14} />
        Se está cancelando
      </span>
    )
  }

  return (
    <span
      role="timer"
      className="flex shrink-0 items-center gap-1"
      aria-label={`Se cancela sola en ${mmss(left)}`}
    >
      {late && <Icon name="priority_high" size={16} filled className="text-danger" />}
      <Icon
        name="timer"
        size={15}
        className={late ? 'text-danger' : onDark ? 'text-white/60' : 'text-ink-muted'}
      />
      <span
        className={cn(
          'font-mono text-body-lg font-bold tabular-nums',
          late ? (onDark ? 'text-red-300' : 'text-danger') : onDark ? 'text-white' : 'text-ink',
        )}
      >
        {mmss(left)}
      </span>
    </span>
  )
}

/** La línea de debajo, para la ficha: qué pasa a cero y que el cliente lo ve. */
export function CourierAcceptClockNote({
  createdAt,
  deadline,
}: {
  createdAt: string
  deadline: string
}) {
  const minutes = Math.round((Date.parse(deadline) - Date.parse(createdAt)) / 60_000)
  return (
    <p className="flex items-start gap-1.5 text-caption text-ink-muted">
      <Icon name="visibility" size={14} className="mt-0.5 shrink-0" />
      Si nadie la acepta en {minutes} min se cancela sola. El cliente ve este mismo reloj.
    </p>
  )
}

/**
 * La franja de aviso en la tarjeta, solo en los últimos 5 minutos. Va en
 * palabras y no solo en rojo: el reloj ya está rojo, pero «se cancelará» es
 * lo que hace que alguien la tome.
 */
export function CourierExpiryWarning({ deadline }: { deadline: string }) {
  const now = useNow()
  const left = Math.max(0, Math.round((Date.parse(deadline) - now) / 1000))
  if (left === 0 || left > COURIER_LATE_SEC) return null
  return (
    <p className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-meta font-bold text-danger">
      <Icon name="warning" size={14} filled className="shrink-0" />
      Esta solicitud se cancelará si nadie la acepta
    </p>
  )
}

/**
 * Cuánto lleva desde que la aceptó, contando hacia arriba. Solo para el
 * motorizado: es su propio ritmo, el que hay que mejorar, y por ahora el
 * cliente no lo ve.
 *
 * Mono y en gris, sin rojo: no hay un plazo acordado que se esté pasando, así
 * que pintarlo de alarma sería inventarse uno. El número solo ya dice si va
 * lento.
 */
export function CourierElapsed({
  since,
  className,
  onDark = false,
}: {
  since: string
  className?: string
  /** Sobre el hero oscuro de la ficha. */
  onDark?: boolean
}) {
  const now = useNow()
  const sec = Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  return (
    <span
      role="timer"
      aria-label={`Aceptada hace ${mmss(sec)}`}
      className={cn('flex shrink-0 items-center gap-1', className)}
    >
      <Icon name="schedule" size={15} className={onDark ? 'text-white/60' : 'text-ink-muted'} />
      <span
        className={cn(
          'font-mono text-body-lg font-bold tabular-nums',
          onDark ? 'text-white' : 'text-ink',
        )}
      >
        {mmss(sec)}
      </span>
    </span>
  )
}
