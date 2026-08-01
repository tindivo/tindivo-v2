import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Eventos de `order_event_log` que DUPLICAN una transición de estado.
 *
 * `advance_order` escribe `'order.' || p_action` para TODAS sus acciones, así
 * que fusionar las dos fuentes sin filtrar pinta cada entrega dos veces: una
 * como `delivered` (del trigger sobre `orders.status`) y otra como
 * `order.deliver`. Se excluyen aquí, no en el front, para que la línea de
 * tiempo llegue ya limpia.
 *
 * La lista es de exclusión y no de inclusión a propósito: si mañana aparece un
 * evento nuevo que no mueve el estado, sale en la línea de tiempo solo (aunque
 * sea con su nombre crudo) en vez de desaparecer en silencio.
 *
 * `order.ready` NO está aquí aunque a veces sí mueva el estado (a
 * `waiting_driver`, cuando no hay motorizado). Declara un hecho sobre la comida
 * que el estado no cuenta, y es justo el caso que hay que poder ver.
 */
const EVENTOS_REDUNDANTES = new Set([
  'order.created',
  'order.created_manual',
  'order.accept',
  'order.preparing',
  'order.take',
  'order.arrived',
  'order.pickup',
  'order.deliver',
  'order.no_show',
  'order.cancel',
  'order.expired',
  'order.validation_passed',
  'order.validation_failed',
])

type Entrada = {
  kind: 'status' | 'event'
  at: string
  code: string
  actorRole: string | null
  data: Record<string, unknown> | null
  note: string | null
  /** Segundos desde la entrada anterior del hilo. `null` en la primera. */
  elapsedSec: number | null
}

/** Detalle completo de un pedido para el admin. Solo lectura. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()

    const { data: order, error } = await service
      .from('orders')
      .select('*, businesses(name, accent_color), drivers(full_name, phone)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!order) {
      return problem('not_found', {
        detail: 'Pedido no encontrado',
        requestId,
        headers: corsHeaders(req),
      })
    }

    const [items, charges, history, events, strikes] = await Promise.all([
      service
        .from('customer_order_items')
        .select(
          'item_name_snapshot, quantity, unit_price, line_total, note, customer_order_item_modifiers(group_name_snapshot, option_name_snapshot, additional_price_snapshot)',
        )
        .eq('order_id', id)
        .order('created_at'),
      service
        .from('business_charges')
        .select('charge_type, amount, status, description, created_at, settled_at')
        .eq('order_id', id)
        .order('created_at'),
      service
        .from('order_status_history')
        .select('status, changed_at, notes')
        .eq('order_id', id)
        .order('changed_at'),
      service
        .from('order_event_log')
        .select('event_type, actor_role, data, created_at')
        .eq('order_id', id)
        .order('created_at'),
      service
        .from('customer_strikes')
        .select('reason, created_at, delivery_reference')
        .eq('order_id', id),
    ])

    // Un solo hilo cronológico. Sin la segunda fuente, un pedido donde la
    // cajera marcó listo o el motorizado marcó llegada se lee como si no
    // hubiera pasado nada entre dos estados.
    const timeline: Entrada[] = [
      ...(history.data ?? []).map((h) => ({
        kind: 'status' as const,
        at: h.changed_at as string,
        code: h.status as string,
        actorRole: null,
        data: null,
        note: (h.notes as string | null) ?? null,
        elapsedSec: null,
      })),
      ...(events.data ?? [])
        .filter((e) => !EVENTOS_REDUNDANTES.has(e.event_type as string))
        .map((e) => ({
          kind: 'event' as const,
          at: e.created_at as string,
          code: e.event_type as string,
          actorRole: (e.actor_role as string | null) ?? null,
          data: (e.data as Record<string, unknown> | null) ?? null,
          note: null,
          elapsedSec: null,
        })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

    // El tiempo transcurrido se calcula DESPUÉS de ordenar: es lo que responde
    // "dónde se fue el tiempo", y calcularlo por fuente daría saltos.
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1]
      const cur = timeline[i]
      if (prev && cur) {
        cur.elapsedSec = Math.round((Date.parse(cur.at) - Date.parse(prev.at)) / 1000)
      }
    }

    return ok(
      {
        order,
        items: items.data ?? [],
        charges: charges.data ?? [],
        strikes: strikes.data ?? [],
        timeline,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
