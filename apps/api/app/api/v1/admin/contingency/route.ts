import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  orderId: z.uuid(),
  amount: z.number().positive().max(10000),
  reason: z.string().trim().min(3).max(300),
  actorCharged: z.enum(['restaurante', 'tindivo']),
  proofUrl: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Adelantos del fondo de contingencia. `?status=activo|disputado|cancelado|all` (default all). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const VALID = ['activo', 'disputado', 'cancelado'] as const
    const raw = new URL(req.url).searchParams.get('status') ?? 'all'
    const service = createServiceClient()
    let query = service
      .from('contingency_advances')
      .select(
        'id,amount,reason,actor_charged,status,proof_url,dispute_note,created_at,disputed_at,resolved_at,customer_phone,orders(short_id,businesses(name))',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (raw !== 'all' && VALID.includes(raw as (typeof VALID)[number])) {
      query = query.eq('status', raw as (typeof VALID)[number])
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const { data: fundRow } = await service
      .from('app_settings')
      .select('value')
      .eq('key', 'contingency_fund')
      .maybeSingle()
    return ok({ advances: data ?? [], fund: fundRow?.value ?? null }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** El admin registra un adelanto del fondo sobre un pedido (con captura del Yape). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const body = CreateSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('create_contingency_advance', {
      p_order_id: body.orderId,
      p_amount: body.amount,
      p_reason: body.reason,
      p_actor_charged: body.actorCharged,
      p_operator: user.id,
      p_proof_url: body.proofUrl ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
