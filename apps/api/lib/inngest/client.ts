import { Inngest } from 'inngest'
import { z } from 'zod'

export const EVENT_ORDER_CREATED = 'order/created' as const
export const EVENT_ORDER_VALIDATION = 'order/validation' as const
export const EVENT_TRANSFER_REQUESTED = 'transfer/requested' as const
export const EVENT_ORDER_PREPAY = 'order/prepay' as const
export const EVENT_ORDER_PAYMENT_TIMEOUT = 'order/payment.timeout' as const
export const EVENT_ORDER_PREPAY_PROOF_UPLOADED = 'order/prepay.proof_uploaded' as const
export const EVENT_ORDER_NOTIFY_BUSINESS = 'order/notify-business' as const

export const EVENT_ORDER_PROOF_REJECTED_FINAL = 'order/proof-rejected-final' as const
export const EVENT_ORDER_APPEAL_CREATED = 'order/appeal.created' as const

export const OrderProofRejectedFinalSchema = z.object({
  orderId: z.string().uuid(),
  cancelledAt: z.string().datetime(),
})
export type OrderProofRejectedFinalData = z.infer<typeof OrderProofRejectedFinalSchema>

export const OrderAppealCreatedSchema = z.object({
  orderId: z.string().uuid(),
  reportId: z.string().uuid(),
})
export type OrderAppealCreatedData = z.infer<typeof OrderAppealCreatedSchema>

/**
 * Cliente Inngest configurado para Tindivo.
 */
export const inngest = new Inngest({ id: 'tindivo' })

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

/** Datos del evento que agenda la expiración de una solicitud de transferencia. */
export type TransferRequestedData = {
  requestId: string
  /** Override del deadline en ms — SOLO para tests locales. */
  sleepMs?: number
}

/** Envío tipado del evento `transfer/requested` (TTL de `timers.transferTtlSeconds`;
 *  al vencer la solicitud caduca y el pedido se queda con su dueño, 0119). */
export function sendTransferRequested(data: TransferRequestedData) {
  return inngest.send({ name: EVENT_TRANSFER_REQUESTED, data })
}

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

export type OrderPaymentTimeoutData = {
  orderId: string
  sleepMs?: number
}

export function sendOrderPaymentTimeout(data: OrderPaymentTimeoutData) {
  return inngest.send({ name: EVENT_ORDER_PAYMENT_TIMEOUT, data })
}

export type OrderPrepayProofUploadedData = {
  orderId: string
}

export function sendOrderPrepayProofUploaded(data: OrderPrepayProofUploadedData) {
  return inngest.send({ name: EVENT_ORDER_PREPAY_PROOF_UPLOADED, data })
}

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

/** Envío tipado del evento `order/proof-rejected-final` con ID determinista */
export function sendOrderProofRejectedFinal(data: OrderProofRejectedFinalData) {
  const cancelledTime = new Date(data.cancelledAt).getTime()
  return inngest.send({
    name: EVENT_ORDER_PROOF_REJECTED_FINAL,
    data,
    id: `proof-rejected-final-${data.orderId}-${cancelledTime}`,
  })
}

/** Envío tipado del evento `order/appeal.created` */
export function sendOrderAppealCreated(data: OrderAppealCreatedData) {
  return inngest.send({
    name: EVENT_ORDER_APPEAL_CREATED,
    data,
    id: `appeal-created-${data.reportId}`,
  })
}
