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

const ORDER_COLUMNS =
  'id,short_id,order_number,status,source,delivery_method,delivery_distance_band,customer_name,customer_phone,delivery_address,delivery_reference,delivery_coordinates_lat,delivery_coordinates_lng,order_amount,delivery_fee,payment_intent,payment_real,yape_amount,cash_amount,client_pays_with,change_to_give,occupancy_slots,urgent_since,prep_time_minutes,estimated_ready_at,appears_in_queue_at,confirmed_at,preparing_at,waiting_driver_at,heading_at,waiting_at_restaurant_at,picked_up_at,delivered_at,cancelled_at,cancel_reason,customer_notes,business_notes,driver_notes,driver_id,business_id,created_at' as const

/**
 * Detalle completo del pedido para el motorizado: order + items con modifiers
 * + datos del negocio (incl. Yape/QR para el cobro). RLS no alcanza (el driver
 * no puede leer businesses ni items de pedidos sin asignar), así que la
 * autorización vive aquí: asignado a mí, o tomable sin driver (modo preview).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const { id } = await params
    const service = createServiceClient()

    const { data: driver } = await service
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!driver) throw new DomainError('Motorizado no encontrado', 'not_found')

    const { data: order, error: orderErr } = await service
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (orderErr) throw new Error(orderErr.message)
    if (!order) throw new DomainError('Pedido no encontrado', 'not_found')

    const isMine = order.driver_id === driver.id
    let isPreview = false
    if (!isMine) {
      // Preview: tomable (sin driver, en cola visible) y de un negocio autorizado.
      const takeable =
        order.driver_id === null && ['preparing', 'waiting_driver'].includes(order.status)
      const inQueue =
        order.appears_in_queue_at != null && Date.parse(order.appears_in_queue_at) <= Date.now()
      if (!takeable || !inQueue) throw new DomainError('Pedido no encontrado', 'not_found')
      const { data: authorized } = await service
        .from('driver_restaurants')
        .select('driver_id')
        .eq('driver_id', driver.id)
        .eq('business_id', order.business_id)
        .maybeSingle()
      if (!authorized) throw new DomainError('Pedido no encontrado', 'not_found')
      isPreview = true
    }

    const [{ data: items, error: itemsErr }, { data: biz }, { data: transfers }] =
      await Promise.all([
        service
          .from('customer_order_items')
          .select(
            'id,item_name_snapshot,quantity,unit_price,line_total,note,customer_order_item_modifiers(group_name_snapshot,option_name_snapshot,additional_price_snapshot)',
          )
          .eq('order_id', id)
          .order('created_at'),
        service
          .from('businesses')
          .select('id,name,address,phone,coordinates_lat,coordinates_lng,yape_number,qr_url')
          .eq('id', order.business_id)
          .maybeSingle(),
        service
          .from('order_transfer_requests')
          .select('id,from_driver_id,to_driver_id,status,expires_at')
          .eq('order_id', id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()),
      ])
    if (itemsErr) throw new Error(itemsErr.message)

    const pending = transfers ?? []
    const incoming = pending.find((t) => t.from_driver_id === driver.id) ?? null
    const outgoing = pending.find((t) => t.to_driver_id === driver.id) ?? null

    return ok(
      {
        order: {
          id: order.id,
          shortId: order.short_id,
          orderNumber: order.order_number,
          status: order.status,
          source: order.source,
          isManual: order.source === 'business_manual',
          deliveryMethod: order.delivery_method,
          deliveryDistanceBand: order.delivery_distance_band,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          deliveryAddress: order.delivery_address,
          deliveryReference: order.delivery_reference,
          deliveryCoordinatesLat: order.delivery_coordinates_lat,
          deliveryCoordinatesLng: order.delivery_coordinates_lng,
          orderAmount: Number(order.order_amount),
          deliveryFee: Number(order.delivery_fee),
          paymentIntent: order.payment_intent,
          paymentReal: order.payment_real,
          yapeAmount: order.yape_amount == null ? null : Number(order.yape_amount),
          cashAmount: order.cash_amount == null ? null : Number(order.cash_amount),
          clientPaysWith: order.client_pays_with == null ? null : Number(order.client_pays_with),
          changeToGive: order.change_to_give == null ? null : Number(order.change_to_give),
          occupancySlots: order.occupancy_slots,
          urgentSince: order.urgent_since,
          prepTimeMinutes: order.prep_time_minutes,
          estimatedReadyAt: order.estimated_ready_at,
          appearsInQueueAt: order.appears_in_queue_at,
          headingAt: order.heading_at,
          waitingAtRestaurantAt: order.waiting_at_restaurant_at,
          pickedUpAt: order.picked_up_at,
          deliveredAt: order.delivered_at,
          cancelledAt: order.cancelled_at,
          cancelReason: order.cancel_reason,
          customerNotes: order.customer_notes,
          businessNotes: order.business_notes,
          driverNotes: order.driver_notes,
          createdAt: order.created_at,
        },
        items: (items ?? []).map((i) => ({
          id: i.id,
          name: i.item_name_snapshot,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price),
          lineTotal: Number(i.line_total),
          note: i.note,
          modifiers: (i.customer_order_item_modifiers ?? []).map((m) => ({
            group: m.group_name_snapshot,
            option: m.option_name_snapshot,
            additionalPrice: Number(m.additional_price_snapshot),
          })),
        })),
        business: biz
          ? {
              id: biz.id,
              name: biz.name,
              address: biz.address,
              phone: biz.phone,
              coordinatesLat: biz.coordinates_lat == null ? null : Number(biz.coordinates_lat),
              coordinatesLng: biz.coordinates_lng == null ? null : Number(biz.coordinates_lng),
              yapeNumber: biz.yape_number,
              qrUrl: biz.qr_url,
            }
          : null,
        isPreview,
        transfer: {
          incoming: incoming ? { id: incoming.id, expiresAt: incoming.expires_at } : null,
          outgoing: outgoing ? { id: outgoing.id, expiresAt: outgoing.expires_at } : null,
        },
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
