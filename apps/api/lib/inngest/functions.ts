import type { InngestFunction } from 'inngest'
import { processPendingOutboxEvents } from '../outbox/processor'
import { createServiceClient } from '../supabase/service'
import {
  EVENT_ORDER_APPEAL_CREATED,
  EVENT_ORDER_CREATED,
  EVENT_ORDER_PAYMENT_TIMEOUT,
  EVENT_ORDER_PREPAY,
  EVENT_ORDER_PREPAY_PROOF_UPLOADED,
  EVENT_ORDER_PROOF_REJECTED_FINAL,
  EVENT_ORDER_VALIDATION,
  EVENT_TRANSFER_REQUESTED,
  inngest,
  type OrderCreatedData,
  type OrderPaymentTimeoutData,
  type OrderPrepayData,
  type OrderValidationData,
  type TransferRequestedData,
} from './client'

/**
 * Timeout de aceptación: si el negocio no acepta el pedido dentro de la ventana
 * (`app_settings.timers.acceptanceMinutes`), se auto-cancela. El deadline real
 * lo decide la BD (tuneable sin deploy). `expire_order` re-chequea el estado
 * bajo FOR UPDATE → idempotente y a prueba de carreras (si el negocio aceptó
 * justo al saltar el timer, no cancela). `sleepMs` solo lo usan los tests.
 */
export const orderAcceptanceTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-acceptance-timeout',
    name: 'Auto-cancelar pedido no aceptado',
    triggers: [{ event: EVENT_ORDER_CREATED }],
    cancelOn: [
      { event: EVENT_ORDER_PAYMENT_TIMEOUT, match: 'data.orderId' },
      { event: EVENT_ORDER_VALIDATION, match: 'data.orderId' },
    ],
  },
  async ({ event, step }) => {
    const { orderId, sleepMs: override } = event.data as OrderCreatedData

    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const minutes = (data?.value as { acceptanceMinutes?: number } | null)?.acceptanceMinutes ?? 5
      return minutes * 60_000
    })

    await step.sleep('acceptance-window', sleepMs)

    return await step.run('expire-if-still-pending', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order', {
        p_order_id: orderId,
        p_reason: 'pending_acceptance_timeout',
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

export const orderValidationTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-validation-timeout',
    name: 'Auto-cancelar pedido sin validar',
    triggers: [{ event: EVENT_ORDER_VALIDATION }],
    cancelOn: [
      { event: EVENT_ORDER_VALIDATION, match: 'data.orderId' },
      { event: EVENT_ORDER_PAYMENT_TIMEOUT, match: 'data.orderId' },
    ],
  },
  async ({ event, step }) => {
    const { orderId, sleepMs: override } = event.data as OrderValidationData
    const { sleepMs, reason } = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return { sleepMs: override, reason: 'validation_timeout' as const }
      const svc = createServiceClient()
      const [orderRes, settingsRes] = await Promise.all([
        svc.from('orders').select('payment_intent,validation_context').eq('id', orderId).maybeSingle(),
        svc.from('app_settings').select('value').eq('key', 'timers').single(),
      ])
      const isProof =
        orderRes.data?.validation_context === 'proof' || orderRes.data?.payment_intent === 'prepaid'
      const timers = settingsRes.data?.value as
        | { validationMinutes?: number; prepayVerificationMinutes?: number }
        | null
      const minutes = isProof
        ? (timers?.prepayVerificationMinutes ?? 10)
        : (timers?.validationMinutes ?? 5)
      return {
        sleepMs: minutes * 60_000,
        reason: isProof ? ('prepay_timeout' as const) : ('validation_timeout' as const),
      }
    })
    await step.sleep('validation-window', sleepMs)
    return await step.run('expire-if-still-validando', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order', {
        p_order_id: orderId,
        p_reason: reason,
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

/**
 * Timeout de pago: si el cliente no sube su comprobante en `awaiting_payment` dentro de
 * `timers.paymentMinutes` (10 min), se auto-cancela con `prepay_timeout`.
 * `cancelOn` cancela ejecuciones anteriores si se reemite el evento o se sube comprobante.
 */
export const orderPaymentTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-payment-timeout',
    name: 'Auto-cancelar pago no realizado',
    triggers: [{ event: EVENT_ORDER_PAYMENT_TIMEOUT }],
    cancelOn: [
      { event: EVENT_ORDER_PAYMENT_TIMEOUT, match: 'data.orderId' },
      { event: EVENT_ORDER_PREPAY_PROOF_UPLOADED, match: 'data.orderId' },
    ],
  },
  async ({ event, step }) => {
    const { orderId, sleepMs: override } = event.data as OrderPaymentTimeoutData
    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const minutes = (data?.value as { paymentMinutes?: number } | null)?.paymentMinutes ?? 10
      return minutes * 60_000
    })
    await step.sleep('payment-window', sleepMs)
    return await step.run('expire-if-still-awaiting-payment', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order', {
        p_order_id: orderId,
        p_reason: 'prepay_timeout',
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

/**
 * Timeout de verificación de prepago (legacy): conservado por compatibilidad.
 */
export const orderPrepayTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-prepay-timeout',
    name: 'Auto-cancelar prepago sin comprobante',
    triggers: [{ event: EVENT_ORDER_PREPAY }],
  },
  async ({ event, step }) => {
    const { orderId, sleepMs: override } = event.data as OrderPrepayData
    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const minutes =
        (data?.value as { prepayVerificationMinutes?: number } | null)?.prepayVerificationMinutes ??
        10
      return minutes * 60_000
    })
    await step.sleep('prepay-window', sleepMs)
    return await step.run('expire-if-still-validando', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order', {
        p_order_id: orderId,
        p_reason: 'prepay_timeout',
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

/**
 * Timeout de transferencia entre motorizados: si el dueño no responde dentro de
 * `timers.transferTtlSeconds` (60s), la solicitud caduca y el pedido se queda
 * con su motorizado original. El barrido `expire_order_transfers` es idempotente
 * y re-chequea bajo FOR UPDATE, así que convive con el cron failsafe de 1 min.
 */
export const transferRequestTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'transfer-request-timeout',
    name: 'Expiración de solicitud de traspaso',
    triggers: [{ event: EVENT_TRANSFER_REQUESTED }],
  },
  async ({ event, step }) => {
    const { sleepMs: override } = event.data as TransferRequestedData
    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const seconds =
        (data?.value as { transferTtlSeconds?: number } | null)?.transferTtlSeconds ?? 30
      // +2s de gracia: la expiración exacta la decide la BD (expires_at).
      return (seconds + 2) * 1_000
    })
    await step.sleep('transfer-window', sleepMs)
    return await step.run('expire-due-transfers', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order_transfers')
      if (error) throw new Error(error.message)
      return { expired: data }
    })
  },
)

/**
 * Fallback de revisión de prepago tras 24 horas sin apelación del cliente.
 * Utiliza idempotencia por orderId+cancelledAt, sleepUntil con la fecha exacta
 * de cancelled_at + 24h, e invocación a la RPC transaccional create_fallback_appeal_review.
 */
export const orderProofRejectedFallback: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-proof-rejected-fallback',
    name: 'Fallback de revisión de prepago tras 24h sin apelación',
    idempotency: 'event.data.orderId + "-" + event.data.cancelledAt',
    triggers: [{ event: EVENT_ORDER_PROOF_REJECTED_FINAL }],
    cancelOn: [{ event: EVENT_ORDER_APPEAL_CREATED, match: 'data.orderId' }],
  },
  async ({ event, step }) => {
    const { orderId, cancelledAt } = event.data

    const deadline = new Date(new Date(cancelledAt).getTime() + 24 * 60 * 60 * 1000)
    await step.sleepUntil('wait-24h-appeal-deadline', deadline)

    return await step.run('execute-fallback-rpc', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('create_fallback_appeal_review', {
        p_order_id: orderId,
      })

      if (error) {
        // Excepción explícita para forzar reintento del step en Inngest si la BD falla por red o sistema
        throw new Error(`Inngest Fallback RPC Error [${error.code}]: ${error.message}`)
      }

      return data
    })
  },
)

/**
 * Cron reconciliador de Transactional Outbox ejecutado cada 5 minutos.
 */
export const processOutboxEventsCron: InngestFunction.Any = inngest.createFunction(
  {
    id: 'process-outbox-events-cron',
    name: 'Reconciliador de Transactional Outbox cada 5 min',
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }) => {
    return await step.run('process-pending-outbox-events', async () => {
      const count = await processPendingOutboxEvents()
      return { processed: count }
    })
  },
)

/** Registro de funciones servidas por el endpoint /api/inngest. */
export const functions: InngestFunction.Any[] = [
  orderAcceptanceTimeout,
  orderValidationTimeout,
  orderPrepayTimeout,
  transferRequestTimeout,
  orderProofRejectedFallback,
  processOutboxEventsCron,
]
