import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { renderRendimientoPdf } from '@/lib/pdf/rendimiento-report'
import {
  fetchPerformance,
  parsePerformanceRange,
  requireOwnBusiness,
} from '@/lib/reports/performance'

export const dynamic = 'force-dynamic'
// Puppeteer necesita runtime Node.js completo (no Edge).
export const runtime = 'nodejs'
// Un Chromium en frío puede tardar varios segundos en arrancar y renderizar.
export const maxDuration = 60

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * El mismo reporte que se ve en pantalla, en PDF.
 * `?start=YYYY-MM-DD&end=YYYY-MM-DD&label=<rango legible>`
 *
 * Comparte `fetchPerformance` con el endpoint JSON a propósito: el PDF que el
 * negocio archiva y la pantalla que mira tienen que decir el mismo número.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { start, end, label } = parsePerformanceRange(new URL(req.url))
    const biz = await requireOwnBusiness(user.id)
    const data = await fetchPerformance(biz.id, start, end)

    const pdf = await renderRendimientoPdf({
      businessName: biz.name,
      rangeLabel: label,
      data,
    })

    return new Response(new Uint8Array(pdf), {
      headers: {
        ...corsHeaders(req),
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="rendimiento-${start}-al-${end}.pdf"`,
      },
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
