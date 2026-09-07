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
 * La cajera avisó por WhatsApp que el recojo está listo (0221).
 *
 * NO manda el mensaje: lo escribe el navegador abriendo `wa.me` con el texto ya
 * puesto, y quien pulsa enviar es ella. Este endpoint solo sella CUÁNDO lo abrió,
 * para que la tarjeta pueda decírselo de vuelta —«Avisado 20:14»— en un
 * mostrador donde se atienden varios pedidos a la vez.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { id } = await params
    const service = createServiceClient()
    const { data, error } = await service.rpc('mark_pickup_notified', {
      p_order_id: id,
      p_business_user_id: user.id,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'invalid_state_transition')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
