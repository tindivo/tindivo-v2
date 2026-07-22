import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Resumen de cuenta del restaurante (Mi Cuenta):
 * - Saldo deudor actual (balance_due)
 * - Desglose de cargos pendientes por tipo
 * - Detalle itemizado de business_charges en status 'pending' (created_at DESC)
 * - Historial de pagos confirmados en restaurant_payments
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const service = createServiceClient()

    // 1. Buscar el negocio del usuario autenticado
    const { data: biz, error: bizError } = await service
      .from('businesses')
      .select('id, name, balance_due, is_blocked, blocked_for_debt')
      .eq('user_id', user.id)
      .maybeSingle()

    if (bizError) throw new Error(bizError.message)
    if (!biz) throw new DomainError('Negocio no encontrado', 'not_found')

    // 2. Obtener teléfono/whatsapp de soporte desde app_settings
    const { data: supportCfg } = await service
      .from('app_settings')
      .select('value')
      .eq('key', 'support_whatsapp')
      .maybeSingle()

    const supportPhone = supportCfg?.value ? String(supportCfg.value).replace(/"/g, '') : null

    // 3. Obtener cargos pendientes (created_at DESC) con ordenes y reportes asociados
    const { data: rawCharges, error: chargeError } = await (service as any)
      .from('business_charges')
      .select(`
        id, order_id, report_id, charge_type, amount, description, created_at,
        orders ( short_id ),
        reports ( id, type, reason, resolution_notes, evidence_urls, data )
      `)
      .eq('business_id', biz.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (chargeError) throw new Error(chargeError.message)

    let totalCommissions = 0
    let totalDeliveryFees = 0
    let totalRefunds = 0

    const pendingCharges = (rawCharges || []).map((c: any) => {
      const amt = Number(c.amount) || 0

      if (c.charge_type === 'commission') {
        totalCommissions += amt
      } else if (c.charge_type === 'delivery_fee') {
        totalDeliveryFees += amt
      } else if (c.charge_type === 'refund_charge') {
        totalRefunds += amt
      }

      const shortId = c.orders?.short_id ?? null
      const r = c.reports

      return {
        id: c.id,
        chargeType: c.charge_type,
        amount: amt,
        description: c.description,
        createdAt: c.created_at,
        orderId: c.order_id,
        shortId,
        reportId: c.report_id,
        report: r
          ? {
              id: r.id,
              type: r.type,
              reason: r.reason,
              resolutionNotes: r.resolution_notes,
              evidenceUrls: Array.isArray(r.evidence_urls) ? r.evidence_urls : [],
              data: r.data,
            }
          : null,
      }
    })

    // 4. Obtener historial de pagos confirmados desde restaurant_payments
    const { data: rawPayments, error: payError } = await (service as any)
      .from('restaurant_payments')
      .select(`
        id, amount, payment_method, paid_at, note,
        business_charges ( id, order_id )
      `)
      .eq('business_id', biz.id)
      .order('paid_at', { ascending: false })
      .limit(50)

    if (payError) throw new Error(payError.message)

    const paymentHistory = (rawPayments || []).map((p: any) => {
      const charges = p.business_charges as Array<{ id: string; order_id: string | null }> | null
      const uniqueOrderIds = new Set((charges || []).map((ch) => ch.order_id).filter(Boolean))

      return {
        id: p.id,
        amount: Number(p.amount) || 0,
        paymentMethod: p.payment_method,
        paidAt: p.paid_at,
        note: p.note,
        settledChargeCount: charges?.length ?? 0,
        orderCount: uniqueOrderIds.size,
      }
    })

    return ok(
      {
        balanceDue: Number(biz.balance_due) || 0,
        isBlocked: Boolean(biz.is_blocked),
        blockedForDebt: Boolean(biz.blocked_for_debt),
        supportPhone,
        summary: {
          totalCommissions,
          totalDeliveryFees,
          totalRefunds,
        },
        pendingCharges,
        paymentHistory,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
