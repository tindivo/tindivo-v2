import { DeliveryMethodSchema, PaymentIntentSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  deliveryMethod: DeliveryMethodSchema,
  paymentIntent: PaymentIntentSchema,
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(20),
  deliveryAddress: z.string().trim().max(200).optional(),
  deliveryReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.uuid().optional(),
        name: z.string().trim().max(120).optional(),
        unitPrice: z.number().nonnegative().optional(),
        quantity: z.number().int().min(1).max(99).default(1),
        note: z.string().trim().max(140).optional(),
      }),
    )
    .max(50),
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
      p_customer_name: body.customerName,
      p_customer_phone: body.customerPhone,
      p_items: body.items.map((i) => ({
        menu_item_id: i.menuItemId ?? null,
        name: i.name ?? null,
        unitPrice: i.unitPrice ?? null,
        quantity: i.quantity,
        note: i.note ?? null,
      })),
      p_delivery_address: body.deliveryAddress ?? undefined,
      p_delivery_reference: body.deliveryReference ?? undefined,
      p_notes: body.notes ?? undefined,
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
