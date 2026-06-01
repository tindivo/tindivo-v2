import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Bandeja de reportes del admin (Documento Maestro §5). `?status=open` por defecto. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const VALID = ['open', 'resolved', 'dismissed'] as const
    const raw = new URL(req.url).searchParams.get('status') ?? 'open'
    const status =
      raw === 'all' ? 'all' : VALID.includes(raw as (typeof VALID)[number]) ? raw : 'open'
    const service = createServiceClient()
    let query = service
      .from('reports')
      .select(
        'id,type,status,order_id,customer_phone,description,resolution_note,created_at,resolved_at,orders(short_id)',
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (status !== 'all') query = query.eq('status', status as (typeof VALID)[number])
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
