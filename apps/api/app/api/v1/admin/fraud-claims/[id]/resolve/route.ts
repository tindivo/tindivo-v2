import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El admin aprueba (genera adelanto del fondo) o rechaza un claim. Idempotente en el RPC. */
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
    const { data, error } = await service.rpc('resolve_fraud_claim', {
      p_claim_id: id,
      p_resolver: user.id,
      p_approve: body.approve,
      p_note: body.note,
    })
    if (error) throw rpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
