import {
  DeliveryPaymentConfirmationSchema,
  DeliveryPaymentRejectionSchema,
  DeliveryPaymentRejectRequestSchema,
  UuidSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'
import { deliveryPaymentDomainError, toUtcIso } from '../infra/delivery-payment'

const params = z.object({ id: UuidSchema })

/**
 * Solo el negocio confirma que el ingreso llegó (CUS-PAY-014), con o sin captura. No cambia el
 * estado del pedido ni escribe en el libro de cargos. Repetirla devuelve lo mismo.
 */
export const businessPaymentConfirmationHandler = defineHandler(
  {
    module: 'ordering',
    method: 'POST',
    path: '/api/v1/business/orders/{id}/payment-confirmation',
    auth: 'user',
    params,
    response: DeliveryPaymentConfirmationSchema,
  },
  async ({ actor, params: p, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('business')) throw new DomainError('No autorizado', 'forbidden')
    const { data, error } = await deps.supabase().rpc('confirm_delivery_payment', {
      p_order_id: p.id.toLowerCase(),
      p_actor_user_id: actor.userId,
    })
    if (error) {
      throw (
        deliveryPaymentDomainError(error) ??
        new Error('No se pudo confirmar el pago', { cause: error })
      )
    }
    const row = data as { id: string; status: string; paymentVerifiedAt: string }
    return {
      id: row.id,
      status: row.status,
      paymentProofStatus: 'verified' as const,
      paymentVerifiedAt: toUtcIso(row.paymentVerifiedAt),
    }
  },
)

/**
 * El negocio rechaza la captura que estaba mirando. No cancela el pedido, no marca falta y no
 * deshace un ingreso ya confirmado; el cliente puede enviar otra (dos intentos) o pagar en la puerta.
 */
export const businessPaymentProofRejectHandler = defineHandler(
  {
    module: 'ordering',
    method: 'POST',
    path: '/api/v1/business/orders/{id}/payment-proof/reject',
    auth: 'user',
    params,
    body: DeliveryPaymentRejectRequestSchema,
    response: DeliveryPaymentRejectionSchema,
  },
  async ({ actor, params: p, body, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('business')) throw new DomainError('No autorizado', 'forbidden')
    const { data, error } = await deps.supabase().rpc('reject_delivery_payment_proof', {
      p_order_id: p.id.toLowerCase(),
      p_actor_user_id: actor.userId,
      p_attempt: body.attempt,
      p_reason_code: body.reasonCode,
    })
    if (error) {
      throw (
        deliveryPaymentDomainError(error) ??
        new Error('No se pudo rechazar la captura', { cause: error })
      )
    }
    const row = data as { id: string; status: string; attempt: number; attemptsLeft: number }
    return {
      id: row.id,
      status: row.status,
      paymentProofStatus: 'rejected' as const,
      attempt: row.attempt,
      attemptsLeft: row.attemptsLeft,
    }
  },
)
