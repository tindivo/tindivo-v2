import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { withIdempotency } from '@/lib/http/idempotency'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { sendTransferRequested } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  reason: z.string().trim().max(200).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * El motorizado (receptor) solicita absorber el pedido activo de un compañero.
 * TTL ~30s con timeout-as-accept (lo resuelve el backend). Requiere Idempotency-Key.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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
    const { id } = await params
    const body = Schema.parse(await req.json().catch(() => ({})))
    const requestHash = await sha256Hex(JSON.stringify({ orderId: id, ...body }))
    const service = createServiceClient()

    const result = await withIdempotency(
      service,
      { key: idempotencyKey, scope: 'transfer_request', userId: user.id, requestHash },
      async () => {
        const { data, error } = await service.rpc('request_order_transfer', {
          p_to_driver_user_id: user.id,
          p_order_id: id,
          p_reason: body.reason,
        })
        if (error) throw rpcError(error)
        return { status: 201, body: data }
      },
    )

    // Best-effort: el cron de 1 min cubre si Inngest falla.
    if (!result.replayed) {
      const created = result.body as { id?: string } | null
      if (created?.id) {
        try {
          await sendTransferRequested({ requestId: created.id })
        } catch {
          // El barrido failsafe resolverá la expiración.
        }
      }
    }

    return ok(result.body, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
