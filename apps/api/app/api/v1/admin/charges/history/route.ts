import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Historial de pagos de restaurantes registando en restaurant_payments con conteo de cargos vinculados (payment_id) */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()

    const { data: payments, error } = await (service as any)
      .from('restaurant_payments')
      .select(
        'id, business_id, amount, payment_method, paid_at, note, businesses(name), business_charges(id, order_id)',
      )
      .order('paid_at', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    const result = (payments || []).map((p: any) => {
      const bizName = (p.businesses as unknown as { name: string } | null)?.name ?? '—'
      const charges = p.business_charges as Array<{ id: string; order_id: string | null }> | null
      const uniqueOrderIds = new Set((charges || []).map((c) => c.order_id).filter(Boolean))

      return {
        id: p.id,
        businessId: p.business_id,
        businessName: bizName,
        amount: Number(p.amount) || 0,
        paymentMethod: p.payment_method,
        paidAt: p.paid_at,
        note: p.note,
        settledChargeCount: charges?.length ?? 0,
        orderCount: uniqueOrderIds.size,
      }
    })

    return ok(result, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
