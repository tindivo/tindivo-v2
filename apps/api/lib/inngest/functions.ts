import type { InngestFunction } from 'inngest'
import { createServiceClient } from '../supabase/service'
import {
  type CashDeliveredData,
  EVENT_CASH_DELIVERED,
  EVENT_ORDER_CREATED,
  EVENT_ORDER_PREPAY,
  EVENT_ORDER_VALIDATION,
  EVENT_TRANSFER_REQUESTED,
  inngest,
  type OrderCreatedData,
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

/**
 * Auto-confirmación de efectivo: si el negocio no confirma la entrega del
 * motorizado dentro de `timers.cashAutoConfirmHours` (24h), se asume confirmada
 * (evita que el driver quede en limbo — Documento §6). Idempotente: solo afecta
 * si sigue en `pending_confirmation`.
 */
export const cashSettlementAutoConfirm: InngestFunction.Any = inngest.createFunction(
  {
    id: 'cash-settlement-auto-confirm',
    name: 'Auto-confirmar efectivo a las 24h',
    triggers: [{ event: EVENT_CASH_DELIVERED }],
  },
  async ({ event, step }) => {
    const { cashSettlementId, sleepMs: override } = event.data as CashDeliveredData

    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const hours =
        (data?.value as { cashAutoConfirmHours?: number } | null)?.cashAutoConfirmHours ?? 24
      return hours * 3_600_000
    })

    await step.sleep('cash-confirm-window', sleepMs)

    return await step.run('auto-confirm', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('auto_confirm_cash_settlement', {
        p_id: cashSettlementId,
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

/**
 * Timeout de validación: si la cajera no valida un pedido en `validando` dentro
 * de `timers.validationMinutes` (5 min), se auto-cancela. `expire_order` re-chequea
 * el estado bajo FOR UPDATE (idempotente: no cancela si ya pasó la validación).
 */
export const orderValidationTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'order-validation-timeout',
    name: 'Auto-cancelar pedido sin validar',
    triggers: [{ event: EVENT_ORDER_VALIDATION }],
  },
  async ({ event, step }) => {
    const { orderId, sleepMs: override } = event.data as OrderValidationData
    const sleepMs = await step.run('resolve-deadline', async () => {
      if (typeof override === 'number') return override
      const svc = createServiceClient()
      const { data } = await svc.from('app_settings').select('value').eq('key', 'timers').single()
      const minutes = (data?.value as { validationMinutes?: number } | null)?.validationMinutes ?? 5
      return minutes * 60_000
    })
    await step.sleep('validation-window', sleepMs)
    return await step.run('expire-if-still-validando', async () => {
      const svc = createServiceClient()
      const { data, error } = await svc.rpc('expire_order', {
        p_order_id: orderId,
        p_reason: 'validation_timeout',
      })
      if (error) throw new Error(error.message)
      return data
    })
  },
)

/**
 * Timeout de verificación de prepago: si el cliente no sube comprobante / el
 * negocio no lo aprueba dentro de `timers.prepayVerificationMinutes` (10 min),
 * se auto-cancela. `expire_order` re-chequea `validando` bajo FOR UPDATE.
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
 * `timers.transferTtlSeconds` (30s), el silencio acepta (spec v1). El barrido
 * `expire_order_transfers` es idempotente y re-chequea bajo FOR UPDATE, así que
 * convive con el cron failsafe de 1 min y con la expiración perezosa de respond.
 */
export const transferRequestTimeout: InngestFunction.Any = inngest.createFunction(
  {
    id: 'transfer-request-timeout',
    name: 'Timeout-as-accept de transferencia',
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

/** Registro de funciones servidas por el endpoint /api/inngest. */
export const functions: InngestFunction.Any[] = [
  orderAcceptanceTimeout,
  cashSettlementAutoConfirm,
  orderValidationTimeout,
  orderPrepayTimeout,
  transferRequestTimeout,
]
