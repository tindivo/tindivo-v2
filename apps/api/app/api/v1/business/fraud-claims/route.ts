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

const CreateSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive().max(99999.99),
  reason: z.string().trim().min(1).max(500),
  evidenceUrl: z.string().trim().max(1000).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio reclama cobertura por fraude de un pedido. Requiere Idempotency-Key. */
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
    const { user } = await requireRole(req, 'business')
    const body = CreateSchema.parse(await req.json())
    const requestHash = await sha256Hex(JSON.stringify(body))
    const service = createServiceClient()
    const result = await withIdempotency(
      service,
      { key: idempotencyKey, scope: 'create_fraud_claim', userId: user.id, requestHash },
      async () => {
        const { data, error } = await service.rpc('create_fraud_claim', {
          p_order_id: body.orderId,
          p_business_user_id: user.id,
          p_amount: body.amount,
          p_reason: body.reason,
          p_evidence_url: body.evidenceUrl,
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
