import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { withIdempotency } from '@/lib/http/idempotency'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const INCIDENT_TYPES = [
  'no_show',
  'fake_address',
  'customer_abuse',
  'payment_fraud',
  'rejected_proof',
  'other',
] as const

const CreateSchema = z.object({
  orderId: z.string().uuid(),
  incidentType: z.enum(INCIDENT_TYPES),
  description: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El motorizado reporta un incidente durante la entrega. Requiere Idempotency-Key. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const idempotencyKey = req.headers.get('idempotency-key')
    if (!idempotencyKey) {
      return problem('validation_error', {
        detail: 'Falta el header Idempotency-Key',
        requestId,
        headers: corsHeaders(req),
      })
    }
    const { user } = await requireRole(req, 'driver')
    const body = CreateSchema.parse(await req.json())
    const requestHash = await sha256Hex(JSON.stringify(body))
    const service = createServiceClient()
    const result = await withIdempotency(
      service,
      { key: idempotencyKey, scope: 'create_incident', userId: user.id, requestHash },
      async () => {
        const { data, error } = await service.rpc('create_customer_incident', {
          p_order_id: body.orderId,
          p_incident_type: body.incidentType,
          p_description: body.description,
          p_reported_by: user.id,
          p_reported_by_role: 'driver',
        })
        if (error) throw rpcError(error)
        return { status: 200, body: data }
      },
    )
    return ok(result.body, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Incidentes recientes reportados por este motorizado. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const service = createServiceClient()
    const { data, error } = await service
      .from('customer_incidents')
      .select(
        'id,order_id,incident_type,description,is_strike,reviewed_at,review_result,created_at',
      )
      .eq('reported_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
