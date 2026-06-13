import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  accept: z.boolean(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * El dueño actual del pedido acepta o rechaza la solicitud de traspaso.
 * Si la solicitud ya venció, el RPC aplica timeout-as-accept (silencio = sí).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('respond_order_transfer', {
      p_request_id: id,
      p_responder_user_id: user.id,
      p_accept: body.accept,
    })
    if (error) throw rpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
