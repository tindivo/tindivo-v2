import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Monitor de pedidos del admin (los más recientes). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('orders')
      .select(
        'id,short_id,order_number,status,customer_name,customer_phone,order_amount,delivery_fee,tindivo_commission,delivery_method,payment_intent,client_pays_with,change_to_give,created_at,business_id,driver_id',
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
