import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Auditoría: bitácora inmutable de eventos de pedidos. `?shortId=` filtra por pedido. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const shortId = new URL(req.url).searchParams.get('shortId')
    const service = createServiceClient()

    let orderId: string | null = null
    if (shortId) {
      const { data: ord } = await service
        .from('orders')
        .select('id')
        .eq('short_id', shortId.trim().toUpperCase())
        .maybeSingle()
      orderId = ord?.id ?? '00000000-0000-0000-0000-000000000000' // sin coincidencias → vacío
    }

    let query = service
      .from('order_event_log')
      .select('id,event_type,actor_role,actor_user_id,data,created_at,orders(short_id)')
      .order('created_at', { ascending: false })
      .limit(150)
    if (orderId) query = query.eq('order_id', orderId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
