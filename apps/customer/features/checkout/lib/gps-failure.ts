import type { PaymentIntent } from '@tindivo/contracts'
import type { GeoBlockKind, GpsValidationPayload } from '@/features/checkout/types'

/**
 * Qué hacer cuando leer el GPS falla (permiso negado, sin señal, timeout).
 *
 * Regla de negocio (antifraude.md, reglas 4 y 6): negar el GPS o no tenerlo
 * NUNCA impide pedir a quien tiene compra previa. Se manda `failed` y decide el
 * servidor (`create_customer_order`, 0230: el GPS no condiciona la elegibilidad por compra previa; con `failed` no se evalúa
 * `gps_warning_zone` (>400 m al punto de entrega), el único disparador de GPS que queda). Sin
 * compra previa y sin GPS, el servidor exige prepago, así que aquí se ofrece
 * la hoja de reintentar / pagar por adelantado.
 */
export function gpsFailureOutcome(input: {
  selectedPayment: PaymentIntent
  recojoPresencial: boolean
  hasDeliveryHistory: boolean
}): { payload?: GpsValidationPayload; issue?: GeoBlockKind } {
  if (input.selectedPayment === 'prepaid') return { payload: { method: 'manual_skip_prepaid' } }
  // El recojo presencial se registra como fallo y sigue: decide la cajera.
  if (input.recojoPresencial) return { payload: { method: 'failed' } }
  if (input.hasDeliveryHistory) return { payload: { method: 'failed' } }
  return { issue: 'unavailable' }
}
