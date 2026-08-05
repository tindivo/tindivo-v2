import { RegisterRefundSchema } from '@tindivo/contracts'
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user, token } = await requireRole(req, 'admin')
    const { id } = await params
    const reportId = ReportIdSchema.parse(id)
    const body = RegisterRefundSchema.parse(await req.json())

    // Repuntado en 0123 a la sobrecarga de 4 argumentos, la única que queda y la
    // que escribe en business_charges. OJO con el orden: entre las dos firmas,
    // `p_amount` y `p_refund_proof_path` estaban intercambiados. Se pasan por
    // nombre a propósito.
    // Sigue con createUserClient: la RPC comprueba el rol con
    // current_user_has_role, que resuelve por auth.uid() y necesita el JWT.
    const client = createUserClient(token)
    const { data, error } = await client.rpc('register_appeal_refund', {
      p_report_id: reportId,
      p_amount: body.amount,
      p_refund_proof_path: body.refundProofPath,
      p_admin_user_id: user.id,
    })

    if (error) throwRpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
