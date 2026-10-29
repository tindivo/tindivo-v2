import type { DeliveryMethod, PaymentIntent, PickupTiming } from './enums'

/**
 * QUÉ PUEDE ELEGIR EL CLIENTE PARA PAGAR, SEGÚN CÓMO RECIBE EL PEDIDO.
 *
 * FUENTE ÚNICA de una regla que antes no estaba escrita en ninguna parte: el
 * checkout pintaba las tres opciones siempre, el contrato no las cruzaba con el
 * método, la API trataba `pending_cash` y `pending_yape` como lo mismo, y
 * `create_customer_order` solo tenía guard para `pending_mixed`. Un recojo con
 * «Yape al recibir» entraba por las cuatro capas sin que ninguna se quejara.
 *
 * ESTO ES SOLO EL CANAL DEL CLIENTE. El pedido manual de la cajera
 * (`create_business_manual_order`, que también recibe `delivery_method`) NO
 * pasa por aquí y no debe: un recojo manual cobrado por Yape es legítimo, ella
 * ya tuvo el dinero en la mano antes de crear la fila.
 *
 * ── LA TABLA VIGENTE (0283) Y POR QUÉ ────────────────────────────────────────
 *
 * | | delivery | recojo (ahora o más tarde) |
 * |---|---|---|
 * | Efectivo (`pending_cash`) | sí | no |
 * | Yape al recibir (`pending_yape`) | sí | no |
 * | Prepago con captura (`prepaid`) | sí | sí |
 *
 * 1. EL RECOJO SOLO SE PAGA POR PREPAGO, «ahora» o «más tarde» (decisión de
 *    Jesús, 2026-10-29). Un recojo llega a cocina pagado: era la regla del
 *    restaurante del piloto y desde 0283 vale también para «ahora». Revierte
 *    la columna «recojo ahora» de 0223, que aún admitía la caja.
 *
 * 2. `pending_yape` NO EXISTE EN UN RECOJO (desde 0223). Ese método significa
 *    que el cliente le transfiere AL MOTORIZADO cuando le entrega la bolsa, y
 *    en un mostrador no hay motorizado.
 *
 * El delivery no cambia: ahí el motorizado sí existe y las tres siguen valiendo.
 *
 * ── EL ESPEJO EN SQL ─────────────────────────────────────────────────────────
 * `create_customer_order` repite la regla del recojo para el origen
 * `customer_pwa` (0283, `pickup_requires_prepaid`), y `orders_pickup_payment_chk`
 * (0223) queda de suelo. Si cambias esta función, cambia también esa migración:
 * son redes distintas para lo mismo, y la de SQL es la que de verdad protege (un
 * cliente puede llamar a la API sin pasar por esta pantalla).
 */
export function customerPaymentIntents(
  deliveryMethod: DeliveryMethod,
  /**
   * Desde 0283 no cambia el resultado: «ahora», «más tarde» y sin contestar
   * dan lo mismo. Se conserva en la firma para no tocar a los llamadores.
   */
  _pickupTiming: PickupTiming | null,
): readonly PaymentIntent[] {
  if (deliveryMethod !== 'pickup') return ['pending_cash', 'pending_yape', 'prepaid']
  return ['prepaid']
}

/** `true` si el cliente puede elegir ese pago con ese método. */
export function isCustomerPaymentAllowed(
  intent: PaymentIntent,
  deliveryMethod: DeliveryMethod,
  pickupTiming: PickupTiming | null,
): boolean {
  return customerPaymentIntents(deliveryMethod, pickupTiming).includes(intent)
}

/**
 * `true` cuando es EL MÉTODO el que obliga a prepagar (todo recojo, desde 0283), no la cuenta ni el monto.
 *
 * Se separa de `isCustomerPaymentAllowed` porque la pantalla los trata
 * distinto, y la diferencia importa: una opción que NO EXISTE en este canal se
 * esconde (nadie va a poder transferirle a un motorizado que no hay), mientras
 * que una que existe pero hoy no aplica se APAGA con su motivo al lado —el
 * patrón que el checkout ya usa para el tope de efectivo y el bloqueo por
 * riesgo. Apagar «Yape al recibir» en un recojo diría «en este pedido no», y
 * eso sería mentira: no es en este pedido, es nunca.
 */
export function pickupForcesPrepay(
  deliveryMethod: DeliveryMethod,
  _pickupTiming: PickupTiming | null,
): boolean {
  return deliveryMethod === 'pickup'
}
