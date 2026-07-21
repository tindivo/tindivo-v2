import { ResolveAppealSchema } from '@tindivo/contracts'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { throwRpcError } from '@/lib/http/rpc-error'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

const ReportIdSchema = z.string().uuid()

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Resuelve una apelación (aprueba o rechaza).
 * Requiere rol admin — el JWT del admin es auth.uid() en la RPC.
 * Solo opera sobre reportes de tipo rejected_proof_disputed.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'admin')
    const { id } = await params
    const reportId = ReportIdSchema.parse(id)
    const body = ResolveAppealSchema.parse(await req.json())

    const client = createUserClient(token)
    const { data, error } = await client.rpc('resolve_appeal', {
      p_report_id: reportId,
      p_resolution: body.resolution,
      p_note: body.note ?? undefined,
    })

    if (error) throwRpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
