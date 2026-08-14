import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * El motorizado entrega el efectivo de UN pedido (0157).
 *
 * Antes el cuerpo era `{ businessId, deliveredAmount }`: se rendía el negocio
 * entero y el importe lo TECLEABA el motorizado, sin que nadie lo comparara
 * nunca con lo que el servidor había calculado. Ahora el importe no viaja — lo
 * pone la RPC leyendo el pedido — así que no hay forma de que la pantalla mande
 * un número distinto del real.
 */
const Schema = z.object({ orderId: z.uuid() })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** En qué punto del camino está el efectivo de un pedido. */
type CashState = 'pending' | 'delivering' | 'disputed'

/** Un pedido en la pantalla de efectivo del motorizado. */
interface CashOrder {
  orderId: string
  shortId: string
  /** Puede faltar: la pantalla cae al `#shortId`. */
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  /**
   * Solo cuando hubo adelanto. Es lo que permite responder a la pregunta que
   * el motorizado va a hacer —"¿por qué debo S/ 5 de un pedido que se pagó por
   * Yape?"— sin que nadie tenga que reconstruir la cuenta a mano.
   */
  breakdown?: { collected: number; advance: number }
  state: CashState
  /** Null mientras no lo haya entregado. Es lo que la cajera confirma. */
  settlementId: string | null
}

interface CashBusinessGroup {
  businessId: string
  businessName: string
  /** Lo que todavía lleva encima. */
  pendingTotal: number
  pendingCount: number
  /** Lo que ya entregó y está esperando que le confirmen. */
  deliveringTotal: number
  deliveringCount: number
  /** `pending` primero, luego `delivering`/`disputed`. Cada bloque, del más
   *  reciente al más antiguo: el motorizado repasa el fajo empezando por el
   *  último pedido, que es el que tiene fresco. */
  orders: CashOrder[]
}

/** Fila de `orders` tal y como la piden las dos consultas de abajo. */
interface OrderCashRow {
  id: string
  short_id: string
  customer_name: string | null
  delivered_at: string | null
  cash_owed_at_delivery: number | null
  change_advanced: number | null
}

function toCashOrder(o: OrderCashRow, state: CashState, settlementId: string | null): CashOrder {
  const cashOwed = Number(o.cash_owed_at_delivery ?? 0)
  const advance = Number(o.change_advanced ?? 0)
  return {
    orderId: o.id,
    shortId: o.short_id,
    customerName: o.customer_name,
    deliveredAt: o.delivered_at,
    cashOwed,
    // `collected` no se lee: se deriva de la misma resta que define la fórmula,
    // así que no puede contradecir al total. Guardarlo aparte habría creado una
    // copia más de la regla del corte de caja.
    ...(advance > 0 ? { breakdown: { collected: cashOwed - advance, advance } } : {}),
    state,
    settlementId,
  }
}

const recienteAntes = (a: CashOrder, b: CashOrder) =>
  (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')

/**
 * El efectivo del motorizado, pedido por pedido y agrupado por negocio.
 *
 * SIN FILTRO DE FECHA, y no es un olvido. Lo que define el corte es el conjunto
 * de pedidos sin cerrar, no el día: un pedido cobrado ayer que sigue en el
 * bolsillo —o entregado ayer y que la cajera no confirmó— es dinero abierto hoy.
 * Cuando esta consulta sí filtraba por el día de Lima, ese dinero desaparecía de
 * la pantalla a medianoche sin que nada hubiera pasado.
 *
 * Lo confirmado NO se devuelve: ese dinero ya no es problema de nadie, y
 * arrastrarlo por la pantalla es justo lo que hacía difícil ver lo que falta.
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
    if (!drv) return ok({ businesses: [] }, { headers: corsHeaders(req) })

    const groups = new Map<string, CashBusinessGroup>()
    const grupo = (businessId: string, businessName: string): CashBusinessGroup => {
      const g = groups.get(businessId) ?? {
        businessId,
        businessName,
        pendingTotal: 0,
        pendingCount: 0,
        deliveringTotal: 0,
        deliveringCount: 0,
        orders: [],
      }
      groups.set(businessId, g)
      return g
    }

    // ── 1. Lo que todavía lleva encima ───────────────────────────────────────
    //
    // LEE `cash_owed_at_delivery`, NO DEDUCE DEL MÉTODO (0141). Filtrar por
    // `payment_real = 'paid_cash'` dejaba fuera un cobro mixto por el que el
    // motorizado sí lleva su parte en efectivo. `> 0` en vez de un filtro por
    // método: lo que define si entra al corte es llevar dinero, no cómo se llame
    // el cobro.
    const { data: sinRendir } = await service
      .from('orders')
      .select(
        'id, short_id, customer_name, delivered_at, business_id, cash_owed_at_delivery, change_advanced, businesses(name)',
      )
      .eq('driver_id', drv.id)
      .eq('status', 'delivered')
      .gt('cash_owed_at_delivery', 0)
      .is('cash_settlement_id', null)

    for (const row of sinRendir ?? []) {
      const o = row as unknown as OrderCashRow & {
        business_id: string
        businesses: { name?: string } | null
      }
      const g = grupo(o.business_id, o.businesses?.name ?? '—')
      g.pendingTotal += Number(o.cash_owed_at_delivery ?? 0)
      g.pendingCount += 1
      g.orders.push(toCashOrder(o, 'pending', null))
    }

    // ── 2. Lo que ya entregó y sigue abierto ─────────────────────────────────
    //
    // Desde 0157 hay una liquidación POR PEDIDO, así que estos ciclos son
    // siempre de un pedido. Las filas viejas con `order_count > 1` siguen
    // funcionando: se leen por el mismo enlace `orders.cash_settlement_id`, y
    // cada uno de sus pedidos aparece como una línea con el mismo estado.
    const { data: abiertos } = await service
      .from('cash_settlements')
      .select('id, business_id, status, businesses(name)')
      .eq('driver_id', drv.id)
      .in('status', ['pending_confirmation', 'disputed'])

    const porSettlement = new Map<string, { businessId: string; name: string; state: CashState }>()
    for (const s of abiertos ?? []) {
      porSettlement.set(s.id, {
        businessId: s.business_id,
        name: (s.businesses as { name?: string } | null)?.name ?? '—',
        state: s.status === 'disputed' ? 'disputed' : 'delivering',
      })
    }

    if (porSettlement.size > 0) {
      const { data: enlazados } = await service
        .from('orders')
        .select(
          'id, short_id, customer_name, delivered_at, cash_owed_at_delivery, change_advanced, cash_settlement_id',
        )
        .in('cash_settlement_id', [...porSettlement.keys()])

      for (const row of enlazados ?? []) {
        const o = row as unknown as OrderCashRow & { cash_settlement_id: string | null }
        const meta = o.cash_settlement_id ? porSettlement.get(o.cash_settlement_id) : undefined
        if (!meta || !o.cash_settlement_id) continue
        const g = grupo(meta.businessId, meta.name)
        g.deliveringTotal += Number(o.cash_owed_at_delivery ?? 0)
        g.deliveringCount += 1
        g.orders.push(toCashOrder(o, meta.state, o.cash_settlement_id))
      }
    }

    // Dentro de cada negocio: primero lo que hay que entregar (es lo accionable),
    // debajo lo que está esperando confirmación. Mezclarlos por hora dejaba el
    // botón perdido entre líneas sin acción.
    const businesses = [...groups.values()]
    for (const g of businesses) {
      const pendientes = g.orders.filter((o) => o.state === 'pending').sort(recienteAntes)
      const entregados = g.orders.filter((o) => o.state !== 'pending').sort(recienteAntes)
      g.orders = [...pendientes, ...entregados]
    }
    // El negocio con más dinero por entregar, primero.
    businesses.sort((a, b) => b.pendingTotal - a.pendingTotal)

    return ok({ businesses }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** El motorizado entrega el efectivo de un pedido. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('deliver_order_cash', {
      p_driver_user_id: user.id,
      p_order_id: body.orderId,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }
    // La confirmación es SIEMPRE humana: la cajera cuenta el dinero. No se
    // agenda auto-confirmación a las 24h (0112), así que un pedido entregado y
    // sin confirmar sigue visible en las dos pantallas hasta que alguien lo
    // cierre, aunque cambie el día.
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
