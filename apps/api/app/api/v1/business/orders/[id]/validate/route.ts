import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated } from '@/lib/inngest/client'
import { processPendingOutboxEvents } from '@/lib/outbox/processor'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  pass: z.boolean(),
  reason: z.string().trim().max(200).optional(),
  reasonCode: z
    .enum(['out_of_stock', 'closed', 'out_of_zone', 'invalid_proof', 'no_answer', 'other'])
    .optional(),
  /**
   * Tiempo de cocción elegido por la cajera. Lo usa `validate_order` cuando la
   * aprobación deja el pedido en `preparing`: comprobante verificado, o
   * aprobación telefónica de un contraentrega. Mismo rango que en
   * `order-transition.ts`.
   */
  prepTimeMinutes: z.number().int().min(1).max(120).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio valida (llamada OK) o rechaza un pedido en `validando`. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('validate_order', {
      p_order_id: id,
      p_actor_user_id: user.id,
      p_actor_role: 'business',
      p_pass: body.pass,
      p_reason: body.reason ?? undefined,
      p_reason_code: body.reasonCode ?? undefined,
      p_prep_time_minutes: body.prepTimeMinutes ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }

    const result = data as { ok?: boolean; status?: string }
    if (result?.status === 'pending_acceptance') {
      try {
        await sendOrderCreated({ orderId: id })
      } catch {}
    } else if (result?.status === 'awaiting_payment') {
      try {
        const { sendOrderPaymentTimeout } = await import('@/lib/inngest/client')
        await sendOrderPaymentTimeout({ orderId: id })
      } catch {}
    } else if (result?.status === 'cancelled') {
      // El trigger trg_orders_outbox_events ya encoló atómicamente el evento order/proof-rejected-final en outbox_events
      processPendingOutboxEvents().catch((err: any) =>
        console.warn('Outbox dispatch warning:', err),
      )
    }

    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
