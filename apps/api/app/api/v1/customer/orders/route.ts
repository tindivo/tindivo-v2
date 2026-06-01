import { CreateOrderRequestSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { withIdempotency } from '@/lib/http/idempotency'
import { handleError, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated, sendOrderPrepay, sendOrderValidation } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Crea un pedido del cliente. Requiere sesión de cliente + Idempotency-Key. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const idempotencyKey = req.headers.get('idempotency-key')
    if (!idempotencyKey) {
      return problem('validation_error', {
        detail: 'Falta el header Idempotency-Key',
        requestId,
        headers: corsHeaders(req),
      })
    }

    const { user } = await requireRole(req, 'customer')
    const body = CreateOrderRequestSchema.parse(await req.json())
    const requestHash = await sha256Hex(JSON.stringify(body))
    const service = createServiceClient()

    const result = await withIdempotency(
      service,
      { key: idempotencyKey, scope: 'create_order', userId: user.id, requestHash },
      async () => {
        const { data, error } = await service.rpc('create_customer_order', {
          p_customer_user_id: user.id,
          p_business_id: body.businessId,
          p_delivery_method: body.deliveryMethod,
          p_payment_intent: body.paymentIntent,
          p_customer_name: body.customerName,
          p_customer_phone: body.customerPhone,
          p_delivery_address: body.deliveryAddress ?? undefined,
          p_delivery_reference: body.deliveryReference ?? undefined,
          p_delivery_lat: body.coordinates?.lat ?? undefined,
          p_delivery_lng: body.coordinates?.lng ?? undefined,
          p_items: body.items.map((i) => ({
            menu_item_id: i.menuItemId,
            quantity: i.quantity,
            note: i.note ?? null,
            modifiers: i.modifiers ?? [],
          })),
          p_source: 'customer_pwa',
        })
        if (error) {
          if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
          if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
          throw new Error(error.message)
        }
        return { status: 201, body: { data } }
      },
    )

    // Agenda el timeout de aceptación SOLO en creación real (no en replay).
    // Best-effort: un fallo de Inngest nunca debe romper la creación del pedido.
    if (!result.replayed) {
      const created = (result.body as { data?: { id?: string; status?: string } }).data
      if (created?.id) {
        try {
          // Agenda el timer según el estado/método: prepago (10m) · validación (5m) · aceptación (5m).
          if (created.status === 'validando' && body.paymentIntent === 'prepaid')
            await sendOrderPrepay({ orderId: created.id })
          else if (created.status === 'validando')
            await sendOrderValidation({ orderId: created.id })
          else await sendOrderCreated({ orderId: created.id })
        } catch {
          // El pedido ya está creado; el negocio lo ve igual. (TODO: dispatch vía outbox.)
        }
      }
    }

    return Response.json(result.body, {
      status: result.status,
      headers: { ...corsHeaders(req), 'idempotency-replayed': String(result.replayed) },
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
