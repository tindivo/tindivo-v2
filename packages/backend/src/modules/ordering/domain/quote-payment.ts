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
  /** Recojo sin respuesta (`null`) = `later`, como `create_customer_order` (0277:629-634). */
  pickupTiming: PickupTiming | null
  /** `false` si `customer_contraentrega_decision` da `risk_blocked` o falla; `no_history` cuenta como `true`. */
  contraentregaAllowed: boolean
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
 * reúne los datos. `prepaid` siempre; la contraentrega solo si el cliente es de
 * confianza, el total no pasa del umbral y no es un recojo «más tarde» (o sin contestar). El
 * motivo no distingue riesgo de falta de historial (antifraude).
 */
export function planQuotePayment(input: QuotePaymentInput): QuotePaymentPlan {
  const intents = customerPaymentIntents(input.deliveryMethod, null)
  const options = intents.map((intent) => {
    if (intent === 'prepaid') {
      return { intent, available: true, unavailableReason: null }
    }
    const unavailableReason: QuoteUnavailableReason | null =
      !input.contraentregaAllowed || !input.settingsReliable
        ? 'prepay_required'
        : input.exceedsPrepayThreshold
          ? 'exceeds_threshold'
          : input.deliveryMethod === 'pickup' && input.pickupTiming !== 'now'
            ? 'pickup_later'
            : null
    return { intent, available: unavailableReason === null, unavailableReason }
  })
  const cashAvailable = options.some((o) => o.intent === 'pending_cash' && o.available)
  return {
    options,
    cash:
      cashAvailable && input.deliveryMethod === 'delivery'
        ? { maxBill: input.maxCashBill, maxChange: input.maxChange, step: CASH_STEP_TEXT }
        : null,
  }
}
