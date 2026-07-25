import {
  CANCEL_REASON_DETAILS,
  CancelReasonDetailSchema,
  DistanceBandSchema,
  PaymentRealSchema,
  type CancelReasonDetail,
  type UserRole,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { createServiceClient } from '../supabase/service'
import { requireRole } from './auth'
import { corsHeaders } from './cors'
import { handleError, ok } from './problem'
import { getRequestId } from './request-id'

const REJECTION_CODES = [
  'out_of_stock',
  'closed',
  'out_of_zone',
  'invalid_proof',
  'no_answer',
  'other',
] as const

const TransitionSchema = z
  .object({
    action: z.string().min(1),
    prepTimeMinutes: z.number().int().min(1).max(120).optional(),
    band: DistanceBandSchema.optional(),
    /** Backpack slots declared at pickup (clamped 1-3 server-side too). */
    slots: z.number().int().min(1).max(3).optional(),
    paymentReal: PaymentRealSchema.optional(),
    reason: z.string().max(200).optional(),
    cancelReasonDetail: CancelReasonDetailSchema.optional(),
    reasonCode: z.enum(REJECTION_CODES).optional(),
    reasonText: z.string().max(300).optional(),
  })
  .transform((val) => {
    if (val.action === 'cancel') {
      let detail = val.cancelReasonDetail
      if (!detail && val.reasonCode) {
        if ((CANCEL_REASON_DETAILS as readonly string[]).includes(val.reasonCode)) {
          detail = val.reasonCode as CancelReasonDetail
        }
      }
      if (!detail) {
        detail = 'other'
      }
      return { ...val, cancelReasonDetail: detail }
    }
    return val
  })
  .superRefine((val, ctx) => {
    if (val.action === 'cancel' && (val.reason === 'business_cancelled' || !val.reason)) {
      if (!val.cancelReasonDetail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Motivo detallado de cancelación es obligatorio para cancelaciones de negocio',
          path: ['cancelReasonDetail'],
        })
      }
    }
  })

/** Lógica compartida de transición de pedido para negocio y motorizado. */
export async function handleOrderTransition(
  req: Request,
  role: UserRole,
  orderId: string,
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, role)
    const body = TransitionSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('advance_order', {
      p_order_id: orderId,
      p_actor_user_id: user.id,
      p_actor_role: role,
      p_action: body.action,
      p_params: {
        prepTimeMinutes: body.prepTimeMinutes,
        band: body.band,
        slots: body.slots,
        paymentReal: body.paymentReal,
        reason: body.reason,
        cancelReasonDetail: body.cancelReasonDetail,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText,
      },
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'invalid_state_transition')
      throw new Error(error.message)
    }

    const result = data as { status?: string }
    if (body.action === 'accept' && result?.status === 'awaiting_payment') {
      try {
        const { sendOrderPaymentTimeout } = await import('../inngest/client')
        await sendOrderPaymentTimeout({ orderId })
      } catch {}
    }

    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
