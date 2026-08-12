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

/**
 * Resumen de efectivo del motorizado, agregado por negocio.
 *
 * Devuelve TODO lo pendiente, no lo de hoy: lo que define el corte es el
 * conjunto de pedidos sin rendir, igual que en `create_cash_settlement`. Ver el
 * comentario de la consulta.
 */
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
    if (!drv) return ok({ today: [] }, { headers: corsHeaders(req) })

    // LEE `cash_owed_at_delivery`, NO DEDUCE DEL MÉTODO (0141).
    //
    // Filtraba `payment_real = 'paid_cash'` y sumaba el total del pedido: la
    // misma regla que el RPC de liquidación, escrita otra vez. Con un cobro
    // mixto las dos copias mentían igual —el pedido no salía, y el motorizado
    // veía menos de lo que llevaba encima— y al divergir, la pantalla habría
    // dicho un número y el corte otro.
    //
    // `> 0` en vez de un filtro por método: lo que define si entra al corte es
    // llevar efectivo, no cómo se llame el cobro.
    const { data: orders } = await service
      .from('orders')
      .select('business_id, cash_owed_at_delivery, businesses(name)')
      .eq('driver_id', drv.id)
      .eq('status', 'delivered')
      .gt('cash_owed_at_delivery', 0)
      // Solo lo que AÚN no ha rendido. Antes sumaba todo lo cobrado hoy, así
      // que tras la primera rendición seguía mostrando el total del día y
      // pre-rellenaba el formulario con dinero que ya había entregado.
      //
      // SIN FILTRO DE FECHA, y no es un olvido. `create_cash_settlement` liquida
      // TODO lo no rendido a ese negocio sin mirar el día ("es el conjunto que
      // define la rendición: no la fecha", 0141). Cuando esta consulta sí
      // filtraba por el día de Lima, el efectivo de ayer sin rendir era
      // invisible aquí pero entraba igual en la liquidación: el motorizado
      // confirmaba el total de hoy, el RPC guardaba el total real, y la
      // diferencia le aparecía a la cajera como un faltante de dinero que la
      // pantalla nunca le mostró.
      .is('cash_settlement_id', null)

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
      e.expected += Number(o.cash_owed_at_delivery)
      e.orderCount += 1
      byBiz.set(o.business_id, e)
    }

    const abiertos = ['pending_confirmation', 'disputed'] as const

    // Los settlements ABIERTOS alimentan el bucket "Esperando confirmación". El
    // historial ya no se expone por este endpoint.
    //
    // Tampoco se acotan al día: un ciclo que la cajera no confirmó ayer sigue
    // abierto hoy, y es dinero del motorizado pendiente de cerrar. Filtrarlo por
    // fecha lo hacía desaparecer de su pantalla a medianoche sin que nada
    // hubiera pasado.
    const { data: settlements } = await service
      .from('cash_settlements')
      .select(
        'id, business_id, settlement_date, status, delivered_amount, total_cash, order_count, businesses(name)',
      )
      .eq('driver_id', drv.id)
      .in('status', abiertos)

    // Desde 0111 puede haber VARIOS ciclos por negocio y día, y desde que esta
    // consulta dejó de acotarse al día también los hay de días distintos: el de
    // ayer que la cajera no confirmó y el de hoy. Se listan TODOS los abiertos.
    // Colapsarlos en un `Map` por negocio —como se hacía— dejaba uno arbitrario
    // y borraba de la pantalla dinero que sigue pendiente de cerrar.
    const abiertosDelDriver = settlements ?? []
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
      ...abiertosDelDriver.map((s) => ({
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
    return ok({ today }, { headers: corsHeaders(req) })
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
