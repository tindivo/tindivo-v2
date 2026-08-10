import { mmss } from './format'
import type { BoardOrder } from './types'

/**
 * Cuenta atrás con precisión ADAPTATIVA.
 *
 * `estimated_ready_at` sale de `prep_time_minutes`, que teclea una persona. Un
 * segundero corriendo encima de esa estimación promete una exactitud que el
 * dato no tiene, y mete prisa cuando todavía faltan diez minutos. Los segundos
 * solo informan en el tramo final y cuando ya se pasó: ahí sí cada uno cuenta.
 *
 * Vive aquí y no en cada pantalla porque la tarjeta del board y el detalle se
 * abren una desde la otra: si la regla se duplica, divergen — que es justo lo
 * que pasaba antes (la tarjeta en mm:ss y el detalle en otra cosa).
 */
export function remainingParts(remainingMs: number): { value: string; late: boolean } {
  const late = remainingMs < 0
  const abs = Math.abs(remainingMs)
  return {
    late,
    value: late || abs <= 120_000 ? mmss(abs / 1000) : `~${Math.round(abs / 60_000)} min`,
  }
}

export type Urgency = 'overdue' | 'ready' | 'normal'

/** Urgencia visual del pedido en bandeja (HU-D-011/013). */
export function orderUrgency(
  o: Pick<BoardOrder, 'urgent_since' | 'estimated_ready_at' | 'status'>,
  now: number,
): Urgency {
  if (o.urgent_since || (o.estimated_ready_at && Date.parse(o.estimated_ready_at) < now)) {
    return 'overdue'
  }
  if (o.status === 'waiting_driver') return 'ready'
  return 'normal'
}

/**
 * La urgencia solo mueve el HAIRLINE, nunca el relleno.
 *
 * Antes un pedido urgente inundaba la tarjeta entera de rosa y le sumaba el
 * glow. El relleno semántico aplana el contraste de todo lo que hay dentro
 * —importe, referencia, método de cobro— justo en la tarjeta que más urge leer,
 * y encima repetía lo que ya decían el pulse, la píldora del reloj y el banner
 * de arriba del listado. Cuatro señales para un solo hecho no es énfasis: es
 * ruido, y con seis colores compitiendo no queda jerarquía.
 *
 * El grito lo da `tindivo-overdue-glow`, que anima sombra y anillo exterior sin
 * tocar el fondo.
 */
export const URGENCY_CARD: Record<Urgency, string> = {
  overdue: 'border border-danger/25',
  ready: 'border border-warning/30',
  normal: 'border border-ink/[0.04]',
}
