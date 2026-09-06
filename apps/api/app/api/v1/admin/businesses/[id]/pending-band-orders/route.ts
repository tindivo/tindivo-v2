import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Las carreras de un negocio con el cargo `delivery_fee` todavía `pending` —
 * las que auditar si la cajera marcó la banda mal. Ver migración 0213.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()

    const { data: charges, error: chargesError } = await service
      .from('business_charges')
      .select('order_id')
      .eq('business_id', id)
      .eq('charge_type', 'delivery_fee')
      .eq('status', 'pending')
    if (chargesError) throw new Error(chargesError.message)

    const orderIds = (charges ?? []).map((c) => c.order_id).filter((v): v is string => v != null)
    if (orderIds.length === 0) {
      return ok([], { headers: corsHeaders(req) })
    }

    const { data: orders, error: ordersError } = await service
      .from('orders')
      .select(
        'id, short_id, delivered_at, delivery_reference, delivery_distance_band, delivery_fee_charged, commission_amount, order_amount',
      )
      .in('id', orderIds)
      .eq('delivery_method', 'delivery')
      .order('delivered_at', { ascending: false })
    if (ordersError) throw new Error(ordersError.message)

    return ok(orders ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
