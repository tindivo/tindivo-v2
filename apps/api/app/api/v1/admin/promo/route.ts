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
 * Consumo de la promo de envío gratis (0187).
 *
 * Sin rango temporal, a diferencia de `/admin/metrics`: la promo YA es una
 * ventana de cuatro noches, y recortarla por rango solo permitiría mirar un
 * trozo de algo que se decide entero. La RPC agrega sobre el código vigente en
 * `app_settings`, así que la respuesta siempre habla de la promo de ahora.
 *
 * `cuposRestantes` sale de la misma expresión que el tope que aplica
 * `create_customer_order` (`reserved + redeemed`). Si el número que se publicita
 * y el que frena las redenciones se calcularan por separado, el panel diría una
 * cosa y el candado haría otra.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service.rpc('admin_promo_free_delivery_stats')
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
