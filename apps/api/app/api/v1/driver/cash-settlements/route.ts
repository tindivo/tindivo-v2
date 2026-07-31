import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
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
      // Solo lo que AÚN no ha rendido. Antes sumaba todo lo cobrado hoy, así
      // que tras la primera rendición seguía mostrando el total del día y
      // pre-rellenaba el formulario con dinero que ya había entregado.
      .is('cash_settlement_id', null)
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
        'id, business_id, settlement_date, status, delivered_amount, total_cash, order_count, businesses(name)',
      )
      .eq('driver_id', drv.id)
      .order('settlement_date', { ascending: false })
      .limit(60)

    // Desde 0111 puede haber VARIOS ciclos por negocio y día. El que le importa
    // al motorizado es el abierto; si no hay, ninguno. Un `new Map` sobre todos
    // se quedaba con uno arbitrario.
    const abiertos = ['pending_confirmation', 'disputed']
    const todayMap = new Map(
      (settlements ?? [])
        .filter((s) => s.settlement_date === limaDate && abiertos.includes(s.status))
        .map((s) => [s.business_id, s]),
    )
    // Dos buckets distintos, como en producción — un negocio puede aparecer en
    // los dos a la vez y son cosas diferentes:
    //
    //   'pending'  -> efectivo cobrado y aún no entregado. Lleva botón.
    //   'awaiting' -> ya entregado, esperando que la cajera lo confirme. Solo
    //                 informativo; ese dinero ya no lo tiene el motorizado.
    //
    // Fusionarlos en una sola fila hacía desaparecer el botón en cuanto había
    // un ciclo sin confirmar, y el motorizado no podía rendir lo nuevo.
    const today = [
      ...[...byBiz.values()].map((b) => ({
        ...b,
        kind: 'pending' as const,
        settlementId: null as string | null,
        status: null as string | null,
        deliveredAmount: null as number | null,
      })),
      ...[...todayMap.values()].map((s) => ({
        businessId: s.business_id,
        businessName: (s.businesses as { name?: string } | null)?.name ?? '—',
        expected: Number(s.total_cash ?? 0),
        orderCount: s.order_count ?? 0,
        kind: 'awaiting' as const,
        settlementId: s.id as string | null,
        status: s.status as string | null,
        deliveredAmount: s.delivered_amount as number | null,
      })),
    ]
    // Los ciclos de hoy ya cerrados también van al historial: si no, con varias
    // rendiciones por noche los confirmados desaparecían de las dos listas.
    const history = (settlements ?? []).filter(
      (s) => s.settlement_date !== limaDate || !abiertos.includes(s.status),
    )
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
    // La confirmación es SIEMPRE humana: la cajera cuenta el dinero. Ya no se
    // agenda auto-confirmación a las 24h (0112).
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
