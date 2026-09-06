import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  fetchPerformance,
  parsePerformanceRange,
  requireOwnBusiness,
} from '@/lib/reports/performance'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Métricas del panel «Rendimiento» del negocio autenticado.
 * `?start=YYYY-MM-DD&end=YYYY-MM-DD`
 *
 * Va por la API y no por lectura directa con RLS —que es lo barato en este
 * repo— porque la respuesta necesita el historial completo del negocio para
 * separar clientes nuevos de los que vuelven, y `business_charges` para la
 * factura real. Bajar eso al navegador serían tres consultas y tres formas de
 * desincronizarse con el PDF.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { start, end } = parsePerformanceRange(new URL(req.url))
    const biz = await requireOwnBusiness(user.id)
    const payload = await fetchPerformance(biz.id, start, end)
    return ok({ businessName: biz.name, ...payload }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
