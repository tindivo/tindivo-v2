import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const GenerateSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Lista las liquidaciones (más recientes). `?status=pending|paid|overdue|all`. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const VALID = ['pending', 'paid', 'overdue', 'cancelled'] as const
    const raw = new URL(req.url).searchParams.get('status') ?? 'all'
    const service = createServiceClient()
    let query = service
      .from('settlements')
      .select(
        'id,business_id,period_start,period_end,order_count,total_amount,status,due_date,paid_at,businesses(name)',
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

/** Genera las liquidaciones de comisión de un período (lunes de cobros). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const body = GenerateSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('generate_settlements', {
      p_period_start: body.periodStart,
      p_period_end: body.periodEnd,
      p_due_date: body.dueDate,
      p_created_by: user.id,
    })
    if (error) throw new Error(error.message)
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
