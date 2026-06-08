import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({ result: z.enum(['confirmed', 'dismissed']) })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El admin confirma (genera strike + posible bloqueo) o desestima un incidente. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json().catch(() => ({})))
    const service = createServiceClient()
    const { data, error } = await service.rpc('review_customer_incident', {
      p_incident_id: id,
      p_reviewer: user.id,
      p_result: body.result,
    })
    if (error) throw rpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
