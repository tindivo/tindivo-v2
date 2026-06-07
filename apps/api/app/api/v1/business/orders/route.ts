import { DeliveryMethodSchema, PaymentIntentSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Pedido manual = SOLO monto total (sin selección de platos). Nombre y teléfono
// son opcionales; un único campo de dirección/referencia (máx 500).
const Schema = z.object({
  deliveryMethod: DeliveryMethodSchema,
  paymentIntent: PaymentIntentSchema,
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  deliveryReference: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  prepTimeMinutes: z.number().int().min(1).max(120).default(20),
  orderAmount: z.number().positive().max(99_999_999.99),
  clientPaysWith: z.number().nonnegative().max(99_999_999.99).optional(),
  yapeAmount: z.number().nonnegative().max(99_999_999.99).optional(),
  cashAmount: z.number().nonnegative().max(99_999_999.99).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio crea un pedido manual (por teléfono). 403 si está bloqueado. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('create_business_manual_order', {
      p_business_user_id: user.id,
      p_delivery_method: body.deliveryMethod,
      p_payment_intent: body.paymentIntent,
      p_customer_name: body.customerName ?? undefined,
      p_customer_phone: body.customerPhone ?? undefined,
      p_order_amount: body.orderAmount,
      p_prep_time_minutes: body.prepTimeMinutes,
      p_delivery_reference: body.deliveryReference ?? undefined,
      p_notes: body.notes ?? undefined,
      p_client_pays_with: body.clientPaysWith ?? undefined,
      p_yape_amount: body.yapeAmount ?? undefined,
      p_cash_amount: body.cashAmount ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
