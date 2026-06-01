import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const MS_DAY = 86_400_000
const LIMA_OFFSET_MS = 5 * 3_600_000 // Perú = UTC-5 fijo (sin DST)

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Rango temporal [from, to). `today` = desde medianoche Lima; `7d`/`30d` = ventana móvil. */
function resolveRange(range: string): { from: Date; to: Date } {
  const now = Date.now()
  if (range === '7d') return { from: new Date(now - 7 * MS_DAY), to: new Date(now) }
  if (range === '30d') return { from: new Date(now - 30 * MS_DAY), to: new Date(now) }
  // today (default): medianoche de Lima expresada en UTC.
  const lima = new Date(now - LIMA_OFFSET_MS)
  const midnightUtc = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate())
  return { from: new Date(midnightUtc + LIMA_OFFSET_MS), to: new Date(now) }
}

/** Métricas agregadas para el dashboard del admin. `?range=today|7d|30d` (default today). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const range = new URL(req.url).searchParams.get('range') ?? 'today'
    const { from, to } = resolveRange(range)
    const service = createServiceClient()
    const { data, error } = await service.rpc('admin_metrics', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
