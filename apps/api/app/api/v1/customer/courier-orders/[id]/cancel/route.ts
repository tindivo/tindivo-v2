import { DomainError } from '@tindivo/core'
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
 * Cancelación por el cliente. `advance_courier_order` valida por sí sola que
 * el pedido no sea ya terminal (`courier_invalid_transition`); la propiedad
 * la garantiza esta capa con `requireRole` + `co_customer_select` (RLS) antes
 * de intentar — un id ajeno nunca llega a la RPC con éxito porque el 404
 * ocurre aquí, no dentro de la función.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  const headers = corsHeaders(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { id } = await params
    const service = createServiceClient()

    const { data: owned, error: ownedError } = await service
      .from('courier_orders')
      .select('id')
      .eq('id', id)
      .eq('customer_user_id', user.id)
      .maybeSingle()
    if (ownedError) throw new Error(ownedError.message)
    if (!owned) {
      return handleError(
        new DomainError('No encontramos esa entrega.', 'not_found'),
        requestId,
        req,
      )
    }

    const { data, error } = await service.rpc('advance_courier_order', {
      p_courier_order_id: id,
      p_actor_user_id: user.id,
      p_action: 'cancel',
      p_cancel_reason: 'customer_cancelled',
    })
    if (error) {
      if (error.code === 'P0001') {
        throw new DomainError('Esta entrega ya no se puede cancelar.', 'conflict')
      }
      throw new Error(error.message)
    }
    return ok(data, { headers })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
