import { soles } from '@/lib/format'

/**
 * La regla del vuelto, en un solo sitio.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *   La regla estaba escrita DOS veces con las mismas tres ramas y los mismos
 *   textos: en `cash-selector` (lo que ve el cliente mientras elige) y en
 *   `use-checkout-actions` (lo que se comprueba al enviar, contra un
 *   `max_change` recién pedido al servidor). El CTA parlante necesitaba una
 *   tercera, y tres copias de una regla de dinero es exactamente el fallo que
 *   ya costó caro con la contraentrega: cuando la 0171 amplió qué cuenta como
 *   historial, la copia del API se quedó con el criterio viejo y rechazaba con
 *   403 pedidos que la RPC sí aceptaba.
 *
 * QUÉ NO ES
 *   No es la autoridad. La autoridad es `create_customer_order`, que vuelve a
 *   mirar el techo con la caja de esa noche delante. Esto es lo que el cliente
 *   lee, y su trabajo es no contradecir al servidor: por eso `placeOrder` la
 *   llama con el `max_change` FRESCO de `effective_max_change`, no con el que
 *   el navegador tenga cacheado desde que montó la pantalla.
 */
export interface CashLimits {
  /** Total del pedido, envío incluido. */
  total: number
  /** Billete más grande admitido (`app_settings.max_cash_bill`). */
  maxCashBill: number
  /** Vuelto que la caja del negocio tiene ESTA NOCHE. Cero es válido. */
  maxChange: number
}

/**
 * El billete más grande con el que se puede pagar hoy: el menor entre el tope
 * global y lo que el vuelto de la noche alcanza a cubrir.
 */
export function maxDeclarable({ total, maxCashBill, maxChange }: CashLimits): number {
  return Math.min(maxCashBill, total + maxChange)
}

/** El vuelto que saldría de pagar con `paying`. Nunca negativo. */
export function changeFor(paying: number, total: number): number {
  return Math.max(0, Math.round((paying - total) * 100) / 100)
}

/**
 * Por qué este monto no vale, o `null` si vale.
 *
 * El orden de las ramas ES la precedencia y no es cosmético: un monto que no
 * cubre el total tampoco genera un vuelto que comparar, así que esa rama va
 * primero. Se conserva tal cual estaba en `cash-selector`.
 */
export function cashError(paying: number, limits: CashLimits): string | null {
  const { total, maxCashBill, maxChange } = limits

  if (!Number.isFinite(paying) || paying <= 0) {
    return `Escribe con cuánto vas a pagar (hasta ${soles(maxDeclarable(limits))}).`
  }
  if (paying < total) {
    return `El monto debe cubrir el total (${soles(total)}).`
  }
  if (paying > maxCashBill) {
    return `El monto máximo con el que puedes pagar es ${soles(maxCashBill)}.`
  }

  const change = changeFor(paying, total)
  if (change > maxChange) {
    if (maxChange <= 0) {
      return `Esta noche el negocio no tiene vuelto: paga con ${soles(total)} exactos o elige Yape o Plin.`
    }
    // Se redondea HACIA ABAJO a propósito: un céntimo de más por encima del
    // techo lo rechazaría el servidor, y el consejo dejaría de ser un consejo.
    const tope = Math.floor((total + maxChange) * 100) / 100
    return `Con ${soles(paying)} el vuelto sería ${soles(change)}, y esta noche hay hasta ${soles(maxChange)}. Paga con ${soles(tope)} o menos, o elige Yape o Plin.`
  }
  return null
}
