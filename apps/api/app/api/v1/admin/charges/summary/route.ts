import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Resumen de deuda por negocio agrupado por tipo de cargo en business_charges */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()

    // 1. Obtener negocios con balance_due > 0 o cargos pendientes
    const { data: businesses, error: bizError } = await service
      .from('businesses')
      .select('id, name, logo_url, accent_color, yape_number, balance_due')
      .gt('balance_due', 0)
      .order('balance_due', { ascending: false })

    if (bizError) throw new Error(bizError.message)

    if (!businesses || businesses.length === 0) {
      return ok([], { headers: corsHeaders(req) })
    }

    const businessIds = businesses.map((b) => b.id)

    // 2. Obtener cargos pendientes para estos negocios
    const { data: charges, error: chargeError } = await (service as any)
      .from('business_charges')
      .select('business_id, order_id, charge_type, amount')
      .in('business_id', businessIds)
      .eq('status', 'pending')

    if (chargeError) throw new Error(chargeError.message)

    // 3. Agrupar cargos por negocio
    const result = businesses.map((b) => {
      const bCharges = (charges || []).filter((c: any) => c.business_id === b.id)

      let totalCommissions = 0
      let totalDeliveryFees = 0
      let totalRefunds = 0
      const orderIdSet = new Set<string>()

      for (const c of bCharges) {
        const amt = Number(c.amount) || 0
        if (c.charge_type === 'commission') {
          totalCommissions += amt
          if (c.order_id) orderIdSet.add(c.order_id)
        } else if (c.charge_type === 'delivery_fee') {
          totalDeliveryFees += amt
          if (c.order_id) orderIdSet.add(c.order_id)
        } else if (c.charge_type === 'refund_charge') {
          totalRefunds += amt
        }
      }

      return {
        id: b.id,
        name: b.name,
        logoUrl: b.logo_url,
        accentColor: b.accent_color,
        yapeNumber: b.yape_number,
        balanceDue: Number(b.balance_due) || 0,
        totalCommissions,
        totalDeliveryFees,
        totalRefunds,
        orderCount: orderIdSet.size,
      }
    })

    return ok(result, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
