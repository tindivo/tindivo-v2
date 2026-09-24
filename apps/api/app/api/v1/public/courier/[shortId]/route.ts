import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, problem, raw } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Seguimiento público de una entrega por `short_id`, sin sesión — para el
 * enlace `tindivo.com/r/<slug>` que el cliente comparte con quien recibe
 * (DECISIONS: "sin mensajes automáticos", el cliente comparte el link a mano).
 * Ventana 24h post-entrega, sin teléfonos (`get_courier_tracking`, 0232).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shortId: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  const headers = corsHeaders(req)
  try {
    const { shortId } = await params
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_courier_tracking', { p_short_id: shortId })
    if (error) throw new Error(error.message)
    if (!data) {
      return problem('not_found', {
        detail: 'No encontramos esa entrega, o ya no está disponible.',
        requestId,
        headers,
      })
    }
    return raw(data, { headers })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
