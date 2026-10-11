import { ClientCompatSettingsSchema } from '@tindivo/contracts'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Configuración pública para las apps. Siempre accesible: no pide sesión y el
 * proxy no le evalúa la versión, para que una app obsoleta pueda leer el mínimo
 * y mostrar «actualiza la app».
 */
export async function GET(req: Request) {
  const reqId = getRequestId(req)
  try {
    const { data, error } = await createServiceClient()
      .from('app_settings')
      .select('value')
      .eq('key', 'client_compat')
      .maybeSingle()
    if (error) throw error
    const settings = ClientCompatSettingsSchema.parse(data?.value)
    return ok(
      { ...settings, apiVersion: 'v1' as const, serverTime: new Date().toISOString() },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, reqId, req)
  }
}
