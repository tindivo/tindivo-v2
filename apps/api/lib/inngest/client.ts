import { Inngest } from 'inngest'

/**
 * Cliente Inngest. En local, el Dev Server (`npx inngest-cli dev`) recibe los
 * eventos sin keys; en cloud usa INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY (los
 * lee el SDK del entorno). El tipado de eventos se hace con wrappers (abajo) en
 * vez de `EventSchemas` para no acoplarnos a la API de schemas del SDK.
 */
export const inngest = new Inngest({ id: 'tindivo' })

export const EVENT_ORDER_CREATED = 'order/created' as const

/** Datos del evento que agenda el timeout de aceptación. */
export type OrderCreatedData = {
  orderId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `order/created`. */
export function sendOrderCreated(data: OrderCreatedData) {
  return inngest.send({ name: EVENT_ORDER_CREATED, data })
}

export const EVENT_CASH_DELIVERED = 'cash/delivered' as const

/** Datos del evento que agenda la auto-confirmación de efectivo a las 24h. */
export type CashDeliveredData = {
  cashSettlementId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `cash/delivered`. */
export function sendCashDelivered(data: CashDeliveredData) {
  return inngest.send({ name: EVENT_CASH_DELIVERED, data })
}

export const EVENT_ORDER_VALIDATION = 'order/validation' as const

/** Datos del evento que agenda el timeout de validación por llamada. */
export type OrderValidationData = {
  orderId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `order/validation` (pedido en `validando`). */
export function sendOrderValidation(data: OrderValidationData) {
  return inngest.send({ name: EVENT_ORDER_VALIDATION, data })
}

export const EVENT_ORDER_PREPAY = 'order/prepay' as const

/** Datos del evento que agenda el timeout de verificación de prepago (10 min). */
export type OrderPrepayData = {
  orderId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `order/prepay` (pedido prepago esperando comprobante). */
export function sendOrderPrepay(data: OrderPrepayData) {
  return inngest.send({ name: EVENT_ORDER_PREPAY, data })
}
