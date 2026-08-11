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
 * LA URGENCIA DE LA BANDEJA ES EL RELOJ DE LA COCINA, Y SOLO ESE.
 *
 * Antes también se disparaba con `urgent_since`, que es OTRO reloj: el cron
 * `OrderOverdue` (0134) lo sella cuando nadie ha tomado el pedido tras
 * `assignment_rules.urgentAfterMinutes` (5 por defecto). Se quitó, y conviene
 * saber por qué antes de volver a meterlo:
 *
 *   1. SE DISPARA CON LA COMIDA EN EL HORNO. A los 5 minutos la ETA suele estar
 *      todavía en el futuro, así que el banner gritaba "vencido" junto a un
 *      contador corriendo tan tranquilo. Con un motorizado y ~10 pedidos por
 *      noche, que un pedido pase 5 minutos sin dueño es operación normal —el
 *      motorizado está repartiendo—, no una emergencia.
 *
 *   2. YA HAY UN AVISO, Y ES FUERTE. `OrderOverdue` manda push a TODOS los
 *      motorizados con `requireInteraction` y vibración: "Se está enfriando —
 *      #XXX lleva N min sin motorizado" (`send-push`). Que además el board
 *      pinte un banner rojo pulsante, reordene la lista Y bloquee todas las
 *      demás tarjetas son tres canales más para el mismo hecho. Es exactamente
 *      lo que advierte la nota de `URGENCY_CARD` de este mismo fichero: cuatro
 *      señales para un solo hecho no es énfasis, es ruido — y un banner que
 *      grita cuando no pasa nada deja de creerse cuando pasa.
 *
 * Lo que SÍ merece el banner es que la comida esté lista o pasada y nadie la
 * lleve: ahí el contador llegó a cero y la señal es cierta.
 *
 * `urgent_since` sigue vivo en la base y sigue disparando su push: esto no lo
 * toca. Solo deja de gobernar el color del tablero.
 */
export function isOverdue(estimatedReadyAt: string | null, now: number): boolean {
  return estimatedReadyAt != null && Date.parse(estimatedReadyAt) < now
}

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
  o: Pick<BoardOrder, 'estimated_ready_at' | 'status'>,
  now: number,
): Urgency {
  if (isOverdue(o.estimated_ready_at, now)) return 'overdue'
  if (o.status === 'waiting_driver') return 'ready'
  return 'normal'
}
