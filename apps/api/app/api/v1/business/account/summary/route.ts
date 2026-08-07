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
 * - Desglose de cargos pendientes por tipo (commission, delivery_fee, refund_charge)
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

    // 3. Obtener cargos pendientes (created_at DESC)
    // biome-ignore lint/suspicious/noExplicitAny: business_charges table
    const { data: rawCharges, error: chargeError } = await (service as any)
      .from('business_charges')
      .select('id, order_id, report_id, charge_type, amount, description, created_at')
      .eq('business_id', biz.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (chargeError) throw new Error(chargeError.message)

    const charges = rawCharges || []

    // 4. Cargar sólo short_id de pedidos asociados (ligero)
    const orderIds = Array.from(
      new Set(charges.map((c: any) => c.order_id).filter(Boolean)),
    ) as string[]

    const { data: rawOrders } =
      orderIds.length > 0
        ? await service.from('orders').select('id, short_id').in('id', orderIds)
        : { data: [] }

    const ordersMap = new Map((rawOrders || []).map((o: any) => [o.id, o.short_id]))

    let totalCommissions = 0
    let totalDeliveryFees = 0
    let totalRefunds = 0

    const pendingCharges = charges.map((c: any) => {
      const amt = Number(c.amount) || 0

      if (c.charge_type === 'commission') {
        totalCommissions += amt
      } else if (c.charge_type === 'delivery_fee') {
        totalDeliveryFees += amt
      } else if (c.charge_type === 'refund_charge') {
        totalRefunds += amt
      }

      return {
        id: c.id,
        chargeType: c.charge_type,
        amount: amt,
        description: c.description,
        createdAt: c.created_at,
        orderId: c.order_id,
        shortId: c.order_id ? (ordersMap.get(c.order_id) ?? null) : null,
        reportId: c.report_id,
      }
    })

    // 5. Obtener historial de pagos confirmados desde restaurant_payments
    // biome-ignore lint/suspicious/noExplicitAny: restaurant_payments table
    const { data: rawPayments, error: payError } = await (service as any)
      .from('restaurant_payments')
      .select('id, amount, payment_method, paid_at, note')
      .eq('business_id', biz.id)
      .order('paid_at', { ascending: false })
      .limit(50)

    if (payError) throw new Error(payError.message)

    const payments = rawPayments || []
    const paymentIds = payments.map((p: any) => p.id)

    // Cargar los cargos liquidados asociados a estos pagos (payment_id)
    const { data: settledCharges } =
      paymentIds.length > 0
        ? // biome-ignore lint/suspicious/noExplicitAny: business_charges table
          await (service as any)
            .from('business_charges')
            .select('id, payment_id, order_id')
            .in('payment_id', paymentIds)
        : { data: [] }

    const settledByPaymentMap = new Map<string, Array<{ id: string; order_id: string | null }>>()
    for (const sc of settledCharges || []) {
      if (!sc.payment_id) continue
      if (!settledByPaymentMap.has(sc.payment_id)) {
        settledByPaymentMap.set(sc.payment_id, [])
      }
      settledByPaymentMap.get(sc.payment_id)!.push({ id: sc.id, order_id: sc.order_id })
    }

    const paymentHistory = payments.map((p: any) => {
      const pCharges = settledByPaymentMap.get(p.id) || []
      const uniqueOrderIds = new Set(pCharges.map((ch) => ch.order_id).filter(Boolean))

      return {
        id: p.id,
        amount: Number(p.amount) || 0,
        paymentMethod: p.payment_method,
        paidAt: p.paid_at,
        note: p.note,
        settledChargeCount: pCharges.length,
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
