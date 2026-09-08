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
 * ── LAS TRES REGLAS Y POR QUÉ ────────────────────────────────────────────────
 *
 * 1. `pending_yape` NO EXISTE EN UN RECOJO. Ese método significa una cosa
 *    concreta y física: el cliente le transfiere AL MOTORIZADO cuando le
 *    entrega la bolsa. En un mostrador no hay motorizado — cobra la caja, y la
 *    caja ya declara al cerrar si entró efectivo o Yape (`payment_real`, la
 *    pregunta «¿cómo pagó?» del pie del mostrador). Ofrecerlo era pedirle al
 *    cliente que eligiera un mecanismo inexistente; el sistema lo reinterpretaba
 *    en silencio como «cobrar en caja» y funcionaba de casualidad.
 *
 * 2. UN RECOJO «MÁS TARDE» VA PREPAGADO. Es el único caso del canal donde se
 *    cocina sin nadie delante Y sin caja a la que cobrarle: si el cliente no
 *    aparece, el negocio se comió el plato. Con el dinero dentro antes de
 *    encender la sartén, el plantón deja de costar comida.
 *
 * 3. UN RECOJO «AHORA» SÍ PUEDE PAGAR EN CAJA. El cliente está de pie frente al
 *    mostrador: paga ahí mismo, en efectivo o por Yape, y quien lo cobra es la
 *    misma persona que lo está mirando.
 *
 * El delivery no cambia: ahí el motorizado sí existe y las tres siguen valiendo.
 *
 * ── EL ESPEJO EN SQL ─────────────────────────────────────────────────────────
 * `create_customer_order` repite estas reglas para el origen `customer_pwa`.
 * Si cambias esta función, cambia también esa migración: son dos redes para lo
 * mismo, y la de SQL es la que de verdad protege (un cliente puede llamar a la
 * API sin pasar por esta pantalla).
 */
export function customerPaymentIntents(
  deliveryMethod: DeliveryMethod,
  /**
   * `null` = la pregunta del recojo todavía sin contestar. Devuelve entonces
   * TODO lo que ese método puede llegar a admitir, que es justo lo que la
   * pantalla necesita PINTAR; lo que se puede elegir ahora mismo sale de
   * volver a llamar con la respuesta ya puesta.
   */
  pickupTiming: PickupTiming | null,
): readonly PaymentIntent[] {
  if (deliveryMethod !== 'pickup') return ['pending_cash', 'pending_yape', 'prepaid']
  if (pickupTiming === 'later') return ['prepaid']
  return ['pending_cash', 'prepaid']
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
 * `true` cuando es EL MÉTODO el que obliga a prepagar, no la cuenta ni el monto.
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
  pickupTiming: PickupTiming | null,
): boolean {
  return deliveryMethod === 'pickup' && pickupTiming === 'later'
}
