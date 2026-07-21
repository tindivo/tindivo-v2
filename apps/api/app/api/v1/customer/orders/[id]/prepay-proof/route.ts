import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({ path: z.string().trim().min(1).max(500) })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El cliente registra la ruta del comprobante que subió a Storage (su carpeta). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { id } = await params
    const body = Schema.parse(await req.json())
    // La ruta debe estar dentro de la carpeta del propio usuario (defensa adicional).
    if (!body.path.startsWith(`${user.id}/`)) {
      throw new DomainError('Ruta de comprobante inválida', 'forbidden')
    }
    const service = createServiceClient()
    const { data: order } = await service
      .from('orders')
      .select('customer_user_id,status,payment_intent,proof_attempt')
      .eq('id', id)
      .maybeSingle()
    if (!order || order.customer_user_id !== user.id)
      throw new DomainError('Pedido no encontrado', 'not_found')
    if (order.status !== 'awaiting_payment' || order.payment_intent !== 'prepaid')
      throw new DomainError('El pedido no espera comprobante', 'invalid_state_transition')
    if (order.proof_attempt >= 2) {
      throw new DomainError('Límite de intentos de comprobante excedido', 'forbidden')
    }

    await service
      .from('orders')
      .update({
        status: 'validando',
        comprobante_prepago_url: body.path,
        payment_proof_status: 'pending',
        proof_attempt: order.proof_attempt + 1,
      })
      .eq('id', id)
    await service.from('order_event_log').insert({
      order_id: id,
      event_type: 'order.prepay_proof_uploaded',
      actor_role: 'cliente',
      actor_user_id: user.id,
      data: {
        proof_path: body.path,
        attempt: order.proof_attempt + 1,
      },
    })

    try {
      const { sendOrderPrepayProofUploaded, sendOrderValidation } = await import(
        '@/lib/inngest/client'
      )
      await sendOrderPrepayProofUploaded({ orderId: id })
      await sendOrderValidation({ orderId: id })
    } catch {}

    return ok({ ok: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
