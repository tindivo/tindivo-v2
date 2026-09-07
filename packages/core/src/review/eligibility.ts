import type { OrderStatus } from '@tindivo/contracts'

/**
 * Cuándo un pedido se puede calificar, y por cuál preguntar si hay varios.
 *
 * Regla pura: no toca la base ni el reloj del sistema. La RPC replica lo mismo
 * en SQL (es la que manda de verdad, porque es la única que ve la transacción);
 * esto existe para que el cliente pinte la tarjeta sin ida y vuelta, y para
 * poder probar los bordes sin base de datos.
 *
 * LA VENTANA NO ES DE HORAS, ES DE SEMANAS, y eso es deliberado. La pregunta no
 * se hace al entregar —el cliente cierra la app y se va a comer— sino la
 * siguiente vez que pide. Medido contra prod el 2026-09-06: la brecha entre
 * pedidos del mismo cliente es de 2 días en mediana, 7.4 en p90 y 14 el máximo
 * observado, así que 21 días cubre el 100% de las brechas reales con margen.
 * Pasado ese plazo el pedido caduca callado: nadie quiere que le pregunten por
 * el pollo del mes pasado.
 */

export interface ReviewableOrder {
  orderId: string
  status: OrderStatus
  deliveredAt: Date | null
  hasReview: boolean
  /** Cuándo el cliente dijo "ahora no". Cierra la pregunta, no la ventana. */
  dismissedAt: Date | null
}

export type ReviewEligibility =
  | { kind: 'open'; closesAt: Date }
  | { kind: 'not_delivered' }
  | { kind: 'expired' }
  | { kind: 'already_reviewed' }

const DAY_MS = 86_400_000

/**
 * El orden de los motivos importa: `already_reviewed` gana a `expired` porque
 * es el que le explica algo al cliente ("ya la dejaste", no "se te pasó").
 */
export function reviewEligibility(
  order: ReviewableOrder,
  now: Date,
  windowDays: number,
): ReviewEligibility {
  if (order.hasReview) return { kind: 'already_reviewed' }
  // `delivered` es terminal (invariante 8), así que anclar aquí es seguro: no
  // hay camino de vuelta que pueda invalidar una reseña ya dejada.
  if (order.status !== 'delivered' || !order.deliveredAt) return { kind: 'not_delivered' }

  const closesAt = new Date(order.deliveredAt.getTime() + windowDays * DAY_MS)
  if (now.getTime() > closesAt.getTime()) return { kind: 'expired' }
  return { kind: 'open', closesAt }
}

/**
 * El único pendiente por el que se pregunta: el más reciente.
 *
 * Nunca una cola. Tres preguntas seguidas no dan tres reseñas, dan cero y un
 * cliente molesto; y de un pedido de hace dos semanas ya no se acuerda. Los
 * demás pendientes se dejan caducar en silencio.
 */
export function pickPendingReview(
  orders: readonly ReviewableOrder[],
  now: Date,
  windowDays: number,
): ReviewableOrder | null {
  let pick: ReviewableOrder | null = null
  for (const order of orders) {
    if (order.dismissedAt) continue
    if (reviewEligibility(order, now, windowDays).kind !== 'open') continue
    // `deliveredAt` no es null: `open` lo garantiza.
    if (!pick || (order.deliveredAt as Date) > (pick.deliveredAt as Date)) pick = order
  }
  return pick
}
