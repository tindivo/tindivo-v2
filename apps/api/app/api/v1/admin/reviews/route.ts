import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Query = z.object({
  businessId: z.string().uuid().optional(),
  /** Solo las que traen texto: es la bandeja de lo que hay que leer. */
  withComment: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Bandeja de reseñas del admin. ES EL ÚNICO SITIO DONDE SE LEE EL COMENTARIO.
 *
 * Y tiene que pasar por aquí, con el cliente de service-role, porque el GRANT
 * por columna de la 0217 saca `comment` del rol `authenticated` — incluido el
 * admin cuando navega. No es un rodeo: es lo que sostiene la promesa que la app
 * del cliente le hace al vecino («lo que escribas lo lee solo el equipo de
 * Tindivo»), y por eso no se abre por RLS ni «solo para admin».
 *
 * Se devuelve el pedido y el teléfono del cliente a propósito: el admin es
 * quien tiene que poder llamar cuando una reseña destapa un problema real. Esa
 * es justamente la capacidad que al negocio se le niega.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const url = new URL(req.url)
    const q = Query.parse(Object.fromEntries(url.searchParams))

    const service = createServiceClient()
    let query = service
      .from('order_reviews')
      .select(
        'id,order_id,business_id,driver_id,customer_user_id,rating,tags,comment,created_at,' +
          'orders(short_id,delivered_at,customer_name,customer_phone),' +
          'businesses(name),' +
          'drivers(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(q.limit)

    if (q.businessId) query = query.eq('business_id', q.businessId)
    // `not('comment','is',null)` y no un filtro en JS: si algún día hay cientos,
    // el límite tiene que aplicarse DESPUÉS del filtro, no antes.
    if (q.withComment === 'true') query = query.not('comment', 'is', null)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
