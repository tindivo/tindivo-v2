import {
  customerPaymentIntents,
  type DeliveryMethod,
  type PaymentIntent,
  type PickupTiming,
} from '@tindivo/contracts'

/** Múltiplo en que se declara el billete: S/ 0.50 (el mismo del checkout web). */
export const CASH_STEP_TEXT = '0.50'

export type QuoteUnavailableReason = 'prepay_required' | 'exceeds_threshold' | 'pickup_later'

export interface QuotePaymentInput {
  deliveryMethod: DeliveryMethod
  /**
   * Desde 0283 no cambia las opciones: todo recojo (ahora, más tarde o sin
   * contestar) solo ofrece `prepaid`. Se conserva porque la ruta ya lo manda.
   */
  pickupTiming: PickupTiming | null
  /** `false` si `customer_contraentrega_decision` da `risk_blocked` o falla; `no_history` cuenta como `true`. */
  contraentregaAllowed: boolean
  /**
   * `true` solo si la decisión es `trusted`. El `no_history` puede necesitar prepago
   * (sin GPS local, la creación lo exige) y la cotización no lo sabe: a ese cliente no
   * se le quita `prepaid`.
   */
  customerTrusted: boolean
  /**
   * `true` solo si TODO lo que decide el umbral es cierto para JavaScript: la tarifa del envío (sin
   * lecturas fallidas ni valores que SQL lee distinto) y el umbral (ausente, `null` o un número con
   * céntimos completos). Si es `false`, `prepaid` NO se retira aunque haya opciones al recibir:
   * SQL puede exigir el prepago donde JavaScript cree que basta la contraentrega (CAX-010).
   */
  amountsCertain: boolean
  exceedsPrepayThreshold: boolean
  /**
   * `false` si falló la lectura de `app_settings` o de `effective_max_change`
   * (no es lo mismo que una clave ausente, que usa los respaldos de SQL). Con
   * los ajustes dudosos solo queda `prepaid`.
   */
  settingsReliable: boolean
  /** `app_settings.max_cash_bill`, ya como texto con dos decimales. */
  maxCashBill: string
  maxChange: string
}

export interface QuotePaymentPlan {
  options: Array<{
    intent: PaymentIntent
    available: boolean
    unavailableReason: QuoteUnavailableReason | null
  }>
  cash: { maxBill: string; maxChange: string; step: string } | null
}

/**
 * Qué métodos de pago puede usar el cliente en este pedido (H-7). Pura: la ruta
 * reúne los datos. `prepaid` se oculta solo al cliente `trusted` con alguna opción
 * al recibir disponible; la contraentrega solo en delivery, si el
 * cliente es de confianza y el total no pasa del umbral. Un recojo solo ofrece
 * `prepaid` (0283). El motivo no distingue riesgo de falta de historial
 * (antifraude).
 *
 * `pickup_later` ya no se emite (0283): sigue en el enum de la respuesta porque
 * una app instalada pudo conocerlo (API-3).
 */
export function planQuotePayment(input: QuotePaymentInput): QuotePaymentPlan {
  const intents = customerPaymentIntents(input.deliveryMethod, null)
  const all = intents.map((intent) => {
    if (intent === 'prepaid') {
      return { intent, available: true, unavailableReason: null }
    }
    const unavailableReason: QuoteUnavailableReason | null =
      !input.contraentregaAllowed || !input.settingsReliable
        ? 'prepay_required'
        : input.exceedsPrepayThreshold
          ? 'exceeds_threshold'
          : null
    return { intent, available: unavailableReason === null, unavailableReason }
  })
  // Un confiable (`trusted`, no `no_history`) con alguna opción al recibir disponible
  // no ve `prepaid`: la app instalada pinta el grupo «Antes de recibir» con lo que
  // llegue. `POST /customer/orders` sigue aceptándolo (API-3). Si falta toda opción
  // al recibir (riesgo, umbral, ajustes dudosos, recojo) o el cliente no es
  // `trusted`, `prepaid` sale como siempre.
  const receiveAvailable = all.some((o) => o.intent !== 'prepaid' && o.available)
  const options =
    input.customerTrusted && input.amountsCertain && receiveAvailable
      ? all.filter((o) => o.intent !== 'prepaid')
      : all
  const cashAvailable = options.some((o) => o.intent === 'pending_cash' && o.available)
  return {
    options,
    cash:
      cashAvailable && input.deliveryMethod === 'delivery'
        ? { maxBill: input.maxCashBill, maxChange: input.maxChange, step: CASH_STEP_TEXT }
        : null,
  }
}
