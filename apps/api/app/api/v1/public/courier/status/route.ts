import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, raw } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Estado de Tindivo Entregas sin sesión: el cliente ve precio, horario y si
 * hoy se puede pedir ANTES de iniciar sesión (spec v1: "ve el precio S/ 3
 * antes de iniciar sesión"). Fuente única `courier_service_status()` — no
 * repite la regla de horario/disponibilidad en TS.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  const headers = corsHeaders(req)
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('courier_service_status')
    if (error || !data) {
      return raw(
        { enabled: false, openNow: false, hours: null, price: 3, pausedMessage: null },
        { headers },
      )
    }
    return raw(data, { headers })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
