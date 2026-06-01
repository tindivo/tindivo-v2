import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Liquidaciones de efectivo para el admin. `?status=disputed` por defecto. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const VALID = [
      'pending',
      'pending_confirmation',
      'confirmed',
      'disputed',
      'resolved',
      'auto_assumed_confirmed',
    ] as const
    const raw = new URL(req.url).searchParams.get('status') ?? 'disputed'
    const service = createServiceClient()
    let query = service
      .from('cash_settlements')
      .select(
        'id,settlement_date,total_cash,order_count,status,delivered_amount,confirmed_amount,reported_amount,resolved_amount,dispute_note,created_at,businesses(name),drivers(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (raw !== 'all' && VALID.includes(raw as (typeof VALID)[number])) {
      query = query.eq('status', raw as (typeof VALID)[number])
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
