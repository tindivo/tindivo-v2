import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendCashDelivered } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  businessId: z.uuid(),
  settlementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deliveredAmount: z.number().nonnegative().optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Resumen de efectivo del motorizado: por negocio hoy (esperado) + historial. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const service = createServiceClient()
    const { data: drv } = await service
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!drv) return ok({ today: [], history: [] }, { headers: corsHeaders(req) })

    const limaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const startUtc = new Date(`${limaDate}T05:00:00.000Z`) // Lima 00:00 = 05:00 UTC (UTC-5, sin DST)
    const endUtc = new Date(startUtc.getTime() + 86_400_000)

    const { data: orders } = await service
      .from('orders')
      .select('business_id, order_amount, delivery_fee, businesses(name)')
      .eq('driver_id', drv.id)
      .eq('status', 'delivered')
      .eq('payment_real', 'paid_cash')
      .gte('delivered_at', startUtc.toISOString())
      .lt('delivered_at', endUtc.toISOString())

    const byBiz = new Map<
      string,
      { businessId: string; businessName: string; expected: number; orderCount: number }
    >()
    for (const o of orders ?? []) {
      const name = (o.businesses as { name?: string } | null)?.name ?? '—'
      const e = byBiz.get(o.business_id) ?? {
        businessId: o.business_id,
        businessName: name,
        expected: 0,
        orderCount: 0,
      }
      e.expected += Number(o.order_amount) + Number(o.delivery_fee)
      e.orderCount += 1
      byBiz.set(o.business_id, e)
    }

    const { data: settlements } = await service
      .from('cash_settlements')
      .select(
        'id, business_id, settlement_date, status, delivered_amount, total_cash, businesses(name)',
      )
      .eq('driver_id', drv.id)
      .order('settlement_date', { ascending: false })
      .limit(60)

    const todayMap = new Map(
      (settlements ?? [])
        .filter((s) => s.settlement_date === limaDate)
        .map((s) => [s.business_id, s]),
    )
    const today = [...byBiz.values()].map((b) => {
      const s = todayMap.get(b.businessId)
      return {
        ...b,
        settlementId: s?.id ?? null,
        status: s?.status ?? null,
        deliveredAmount: s?.delivered_amount ?? null,
      }
    })
    const history = (settlements ?? []).filter((s) => s.settlement_date !== limaDate)
    return ok({ today, history }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** El motorizado declara la entrega de efectivo del día a un negocio. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const body = Schema.parse(await req.json())
    const date =
      body.settlementDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const service = createServiceClient()
    const { data, error } = await service.rpc('create_cash_settlement', {
      p_driver_user_id: user.id,
      p_business_id: body.businessId,
      p_settlement_date: date,
      p_delivered_amount: body.deliveredAmount ?? undefined,
    })
    if (error) {
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }
    const created = data as { id?: string }
    if (created?.id) {
      // Best-effort: agenda la auto-confirmación a 24h.
      try {
        await sendCashDelivered({ cashSettlementId: created.id })
      } catch {}
    }
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
