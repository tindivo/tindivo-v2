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
 * Métricas de pedidos online por jornada (customer_pwa).
 * query params: `from` (YYYY-MM-DD), `to` (YYYY-MM-DD).
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const url = new URL(req.url)
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    const service = createServiceClient()
    const rpcParams: { p_from?: string; p_to?: string } = {}
    if (fromParam) rpcParams.p_from = fromParam
    if (toParam) rpcParams.p_to = toParam

    const { data, error } = await service.rpc('admin_online_orders_stats', rpcParams)
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
