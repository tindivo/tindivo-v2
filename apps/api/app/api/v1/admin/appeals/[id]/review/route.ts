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
 * Marca una apelación como "en revisión" para que el cliente sepa que el
 * administrador ya la está evaluando. Idempotente: si ya está in_review o
 * resuelta, la RPC retorna éxito sin cambios.
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

    const client = createUserClient(token)
    const { data, error } = await client.rpc('mark_appeal_in_review', {
      p_report_id: reportId,
    })

    if (error) throwRpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
