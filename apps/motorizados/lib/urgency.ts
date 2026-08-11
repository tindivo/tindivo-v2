import { mmss } from './format'
import type { BoardOrder } from './types'

/**
 * Cuenta atrás en mm:ss, SIEMPRE.
 *
 * Antes era adaptativa: `~12 min` por encima de dos minutos y `mm:ss` por
 * debajo. El argumento era bueno —`estimated_ready_at` sale de un
 * `prep_time_minutes` que teclea una persona, y un segundero encima promete una
 * exactitud que el dato no tiene—, pero pesaba menos que dos cosas:
 *
 *   1. LA CAJERA Y EL MOTORIZADO LEÍAN EL MISMO RELOJ EN FORMATOS DISTINTOS.
 *      `DECISIONS §23` dejó el contador de `negocios` en mm:ss diciendo que
 *      mantenía "la concordancia de tiempo con motorizados". Esa concordancia
 *      no existía por encima de dos minutos: ella veía `09:55` y él `~10 min`
 *      del mismo pedido, justo cuando lo llama para preguntarle si ya sale.
 *
 *   2. mm:ss ES DE ANCHO FIJO. Una lista que mezcla `~12 min` y `04:06` obliga
 *      a cambiar de formato mental en cada tarjeta; con `tabular-nums` las
 *      cifras se alinean en columna y se comparan de un vistazo.
 *
 * La precisión que el dato no tiene se comunica por otras vías (la ranura dice
 * "Lista" en cuanto la cajera lo marca, y `mmss` conmuta a `Xh Ym` cuando el
 * número deja de tener sentido en segundos).
 *
 * Vive aquí y no en cada pantalla porque la tarjeta del board y el detalle se
 * abren una desde la otra: si la regla se duplica, divergen — que es justo lo
 * que pasaba antes. Hoy la usa `preview-section` (el detalle); la tarjeta llama
 * a `mmss` a través de `lib/orders/card-view-model`, y las dos dan lo mismo.
 */
export function remainingParts(remainingMs: number): { value: string; late: boolean } {
  return { late: remainingMs < 0, value: mmss(Math.abs(remainingMs) / 1000) }
}

export type Urgency = 'overdue' | 'ready' | 'normal'

/**
 * Urgencia visual del pedido en bandeja (HU-D-011/013).
 *
 * SOLO PARA "EN ESPERA". Mira si la ETA ya pasó, y en un pedido ya recogido eso
 * es cierto siempre: aplicarla a "Míos" pintaría de rojo cada entrega en curso.
 * `card-view-model` la llama únicamente en la variante `available`, que es la
 * misma en la que `available-tab` ordena, bloquea y dispara el banner. Esa
 * coincidencia es deliberada: antes la tarjeta tenía su propio criterio, más
 * estricto, así que el cartel gritaba "hay un vencido" y la tarjeta señalada se
 * quedaba con el borde neutro.
 */
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
