import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /public/landmarks: las referencias activas del mapa (`map_landmarks`).
 * Públicas por diseño (policy `ml_public_read`); aquí se piden solo las
 * columnas que el mapa pinta y solo las activas.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { data, error } = await createServiceClient()
      .from('map_landmarks')
      .select('id,name,category,lat,lng')
      .eq('active', true)
      .order('name')
    if (error) throw new Error(error.message)
    const items = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }))
    return ok({ items }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
