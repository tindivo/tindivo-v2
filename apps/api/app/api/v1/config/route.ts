import { ClientCompatSettingsSchema, ClientFeaturesSettingsSchema } from '@tindivo/contracts'
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
 *
 * `features` (kill switches): fila AUSENTE = `{}` (la API puede desplegarse
 * antes del db push). Fila presente pero INVÁLIDA = 500: la app conserva su
 * última configuración buena, y nunca se reactiva en silencio algo apagado.
 */
export async function GET(req: Request) {
  const reqId = getRequestId(req)
  try {
    const { data, error } = await createServiceClient()
      .from('app_settings')
      .select('key,value')
      .in('key', ['client_compat', 'client_features'])
    if (error) throw error
    const valorDe = (key: string) => data?.find((row) => row.key === key)?.value
    const settings = ClientCompatSettingsSchema.parse(valorDe('client_compat'))
    const rawFeatures = valorDe('client_features')
    const { features } =
      rawFeatures === undefined ? { features: {} } : ClientFeaturesSettingsSchema.parse(rawFeatures)
    return ok(
      { ...settings, features, apiVersion: 'v1' as const, serverTime: new Date().toISOString() },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, reqId, req)
  }
}
