import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { toCustomerAppealDto } from '@/lib/mappers/appeal'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET: lista las apelaciones del cliente autenticado.
 * Útil para mostrar un resumen en /cuenta sin tener que navegar pedido por pedido.
 * Incluye el short_id del pedido y URL firmada del comprobante de devolución cuando aplica.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')

    const client = createUserClient(token)
    const { data, error } = await client
      .from('reports')
      .select(
        'id, order_id, appeal_status, refund_status, refund_amount, refund_completed_at, appeal_deadline, description, status, created_at, updated_at, refund_proof_path, orders(short_id)',
      )
      .eq('type', 'rejected_proof_disputed')
      .eq('customer_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const service = createServiceClient()
    const items = await Promise.all(
      (data ?? []).map(async (row) => {
        let refundProofUrl: string | null = null
        if (row.refund_proof_path) {
          const { data: signed } = await service.storage
            .from('payment-proofs')
            .createSignedUrl(row.refund_proof_path, 3600)
          refundProofUrl = signed?.signedUrl ?? null
        }
        const orderShortId =
          row.orders && typeof row.orders === 'object' && 'short_id' in row.orders
            ? (row.orders as { short_id: string | null }).short_id
            : null
        return {
          ...toCustomerAppealDto({ ...row, refundProofUrl }),
          orderShortId,
        }
      }),
    )

    return ok({ items, total: items.length }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
