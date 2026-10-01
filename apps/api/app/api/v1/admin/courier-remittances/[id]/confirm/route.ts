import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { COURIER_DEBT_ERRORS } from '@/lib/mappers/courier-driver'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** «Confirmar»: Jesús recibió lo de una entrega. Sale de la deuda del motorizado. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()
    const { data, error } = await service.rpc('admin_confirm_courier_remittance', {
      p_courier_order_id: id,
      p_actor_user_id: user.id,
    })
    if (error) {
      const known = COURIER_DEBT_ERRORS[error.message.split(':')[0] ?? '']
      if (error.code === 'P0001' && known) throw new DomainError(known.detail, known.code)
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
