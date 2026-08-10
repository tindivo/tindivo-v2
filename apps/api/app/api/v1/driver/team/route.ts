import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Estados transferibles (espejo del RPC request_order_transfer).
const TRANSFERABLE = new Set(['heading_to_restaurant', 'waiting_at_restaurant'])

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Vista de equipo: pedidos activos de OTROS motorizados (para solicitar un
 * traspaso) + mis solicitudes pendientes enviadas y recibidas. Service client:
 * RLS no deja al driver ver pedidos ajenos ni nombres de compañeros.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const service = createServiceClient()

    const { data: driver } = await service
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!driver) throw new DomainError('Motorizado no encontrado', 'not_found')

    const nowIso = new Date().toISOString()
    const [{ data: teamRows, error: teamErr }, { data: pending, error: pendErr }] =
      await Promise.all([
        service
          .from('orders')
          .select(
            // `delivery_reference` y `businesses(accent_color)` son los DOS
            // únicos campos que se añadieron para que la pestaña Equipo use la
            // misma tarjeta que las otras bandejas.
            //
            // NO entra nada más, y menos por comodidad: el nombre y el teléfono
            // del cliente son datos de un tercero que no ayudan a decidir un
            // traspaso, y `estimated_ready_at` permitiría pedir solo los pedidos
            // ya listos y dejarle los lentos al compañero. Se elimina el vector
            // en vez de documentarlo como riesgo.
            'id,short_id,status,source,delivery_reference,order_amount,delivery_fee,occupancy_slots,urgent_since,driver_id,drivers(id,full_name,vehicle_type),businesses(name,accent_color)',
          )
          .neq('driver_id', driver.id)
          .not('driver_id', 'is', null)
          .in('status', ['heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'])
          .order('created_at', { ascending: false }),
        service
          .from('order_transfer_requests')
          .select(
            // `delivery_reference` para el modal de C1.1: hay 30 segundos para
            // decidir, y el código corto no basta para reconocer un pedido —
            // "Jr. Los Pinos, casa azul" sí. Aquí NO hay problema de privacidad
            // como en `teamOrders`: estas solicitudes son sobre pedidos PROPIOS
            // de quien las recibe.
            'id,order_id,from_driver_id,to_driver_id,status,reason,expires_at,created_at,orders(short_id,delivery_reference,order_amount,delivery_fee,businesses(name))',
          )
          .eq('status', 'pending')
          .gt('expires_at', nowIso)
          .or(`from_driver_id.eq.${driver.id},to_driver_id.eq.${driver.id}`),
      ])
    if (teamErr) throw new Error(teamErr.message)
    if (pendErr) throw new Error(pendErr.message)

    // Nombres de los drivers solicitantes (para el banner del dueño).
    const requesterIds = [...new Set((pending ?? []).map((r) => r.to_driver_id))]
    const { data: requesters } = requesterIds.length
      ? await service.from('drivers').select('id,full_name').in('id', requesterIds)
      : { data: [] }
    const requesterName = (driverId: string) =>
      (requesters ?? []).find((d) => d.id === driverId)?.full_name ?? 'Compañero'

    return ok(
      {
        teamOrders: (teamRows ?? []).map((o) => ({
          orderId: o.id,
          shortId: o.short_id,
          status: o.status,
          source: o.source,
          total: Number(o.order_amount) + Number(o.delivery_fee),
          occupancySlots: o.occupancy_slots,
          urgentSince: o.urgent_since,
          driver: o.drivers
            ? {
                id: o.drivers.id,
                fullName: o.drivers.full_name,
                vehicleType: o.drivers.vehicle_type,
              }
            : null,
          businessName: o.businesses?.name ?? null,
          // Responde "¿me queda de camino?", que es la pregunta que decide un
          // traspaso.
          deliveryReference: o.delivery_reference ?? null,
          // Franja de color del local: identifica el negocio de un vistazo,
          // igual que en las otras bandejas.
          accentColor: o.businesses?.accent_color ?? null,
          transferable: TRANSFERABLE.has(o.status),
        })),
        sentRequests: (pending ?? [])
          .filter((r) => r.to_driver_id === driver.id)
          .map((r) => ({
            id: r.id,
            orderId: r.order_id,
            shortId: r.orders?.short_id ?? null,
            status: r.status,
            expiresAt: r.expires_at,
            createdAt: r.created_at,
          })),
        receivedRequests: (pending ?? [])
          .filter((r) => r.from_driver_id === driver.id)
          .map((r) => ({
            id: r.id,
            orderId: r.order_id,
            shortId: r.orders?.short_id ?? null,
            total:
              r.orders == null
                ? null
                : Number(r.orders.order_amount) + Number(r.orders.delivery_fee),
            businessName: r.orders?.businesses?.name ?? null,
            deliveryReference: r.orders?.delivery_reference ?? null,
            requesterName: requesterName(r.to_driver_id),
            reason: r.reason,
            expiresAt: r.expires_at,
            // `createdAt` viaja para que el cliente pueda pintar la barra de
            // progreso contra la ventana REAL de la solicitud. El TTL sale de
            // `app_settings.timers.transferTtlSeconds` en el momento de crearla
            // (0043:272-276), así que `expiresAt - createdAt` ES el TTL que se
            // aplicó a ESTA fila — y sigue siendo correcto aunque el ajuste
            // cambie después. Sin este campo el cliente solo puede adivinar.
            createdAt: r.created_at,
          })),
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
