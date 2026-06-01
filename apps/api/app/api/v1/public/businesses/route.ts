import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Solo columnas seguras (reemplaza la vista businesses_public; nunca expone
// yape_number / balance_due / comisiones).
const PUBLIC_COLUMNS =
  'id,name,accent_color,logo_url,banner_url,tagline,categoria,primary_capability,estimated_eta_min,estimated_eta_max,coordinates_lat,coordinates_lng,address,publishes_catalog,accepts_web_pickup,accepts_web_delivery'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('businesses')
      .select(PUBLIC_COLUMNS)
      .eq('publishes_catalog', true)
      .eq('is_active', true)
      .eq('is_blocked', false)
      .order('name')
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
