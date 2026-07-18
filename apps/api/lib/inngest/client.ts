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

export const EVENT_TRANSFER_REQUESTED = 'transfer/requested' as const

/** Datos del evento que agenda la expiración de una solicitud de transferencia. */
export type TransferRequestedData = {
  requestId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `transfer/requested` (TTL ~30s, timeout-as-accept). */
export function sendTransferRequested(data: TransferRequestedData) {
  return inngest.send({ name: EVENT_TRANSFER_REQUESTED, data })
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

export const EVENT_ORDER_PAYMENT_TIMEOUT = 'order/payment.timeout' as const

export type OrderPaymentTimeoutData = {
  orderId: string
  sleepMs?: number
}

export function sendOrderPaymentTimeout(data: OrderPaymentTimeoutData) {
  return inngest.send({ name: EVENT_ORDER_PAYMENT_TIMEOUT, data })
}

export const EVENT_ORDER_PREPAY_PROOF_UPLOADED = 'order/prepay.proof_uploaded' as const

export type OrderPrepayProofUploadedData = {
  orderId: string
}

export function sendOrderPrepayProofUploaded(data: OrderPrepayProofUploadedData) {
  return inngest.send({ name: EVENT_ORDER_PREPAY_PROOF_UPLOADED, data })
}

export const EVENT_ORDER_NOTIFY_BUSINESS = 'order/notify-business' as const

/** Datos del evento que notifica al negocio sobre un nuevo pedido. */
export type OrderNotifyBusinessData = {
  businessId: string
  customerName: string
  shortId: string
  paymentIntent: string
}

/** Envío tipado del evento `order/notify-business`. */
export function sendOrderNotifyBusiness(data: OrderNotifyBusinessData) {
  return inngest.send({ name: EVENT_ORDER_NOTIFY_BUSINESS, data })
}
