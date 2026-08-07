import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Obtiene cargos pendientes de un restaurante en orden FIFO agrupados por unidad (pedido / devolución) */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const url = new URL(req.url)
    const businessId = url.searchParams.get('business_id') || url.searchParams.get('businessId')

    if (!businessId) {
      return ok([], { headers: corsHeaders(req) })
    }

    const service = createServiceClient()
    // biome-ignore lint/suspicious/noExplicitAny: business_charges table added in migration
    const { data: charges, error } = await (service as any)
      .from('business_charges')
      .select(
        'id, business_id, order_id, report_id, charge_type, amount, description, created_at, orders(short_id)',
      )
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    if (!charges || charges.length === 0) {
      return ok([], { headers: corsHeaders(req) })
    }

    // Agrupar por unidad (order_id si existe, o id si es refund_charge sin order_id)
    const groupedMap = new Map<
      string,
      {
        orderId: string | null
        shortId: string | null
        reportId: string | null
        date: string
        createdAt: string
        charges: Array<{ id: string; type: string; amount: number; description: string | null }>
        subtotal: number
      }
    >()

    for (const c of charges) {
      const groupKey = c.order_id ? `order_${c.order_id}` : `charge_${c.id}`
      const amt = Number(c.amount) || 0
      // Extract short_id safely
      const shortId = (c.orders as unknown as { short_id: string } | null)?.short_id ?? null

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          orderId: c.order_id,
          shortId,
          reportId: c.report_id,
          date: c.created_at ? c.created_at.slice(0, 10) : '',
          createdAt: c.created_at,
          charges: [],
          subtotal: 0,
        })
      }

      const grp = groupedMap.get(groupKey)!
      grp.charges.push({
        id: c.id,
        type: c.charge_type,
        amount: amt,
        description: c.description,
      })
      grp.subtotal += amt
    }

    const result = Array.from(groupedMap.values())
    return ok(result, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
