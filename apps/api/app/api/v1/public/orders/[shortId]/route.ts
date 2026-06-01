import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, problem, raw } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Tracking público por short_id (RPC SECURITY DEFINER, ventana 24h). Sin auth. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shortId: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { shortId } = await params
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_tracking', { p_short_id: shortId })
    if (error) throw new Error(error.message)
    if (data === null) {
      return problem('not_found', {
        detail: 'Pedido no encontrado o fuera de la ventana de tracking (24h)',
        requestId,
        headers: corsHeaders(req),
      })
    }
    return raw(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
