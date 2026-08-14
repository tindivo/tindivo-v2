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
 * El negocio confirma el efectivo contado físicamente.
 *
 * SIN CUERPO desde 0157. Aceptaba `{ confirmedAmount }` y la pantalla le pasaba
 * siempre el `delivered_amount` de la propia fila, así que el parámetro no
 * servía para nada salvo para dejar abierta la puerta a que el navegador mandara
 * otro número. Ahora el importe lo deriva la RPC: si la cajera contó algo
 * distinto, eso es una DISPUTA, que tiene su propio camino y su reporte al admin.
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
    const { data, error } = await service.rpc('confirm_order_cash', {
      p_settlement_id: id,
      p_business_user_id: user.id,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
