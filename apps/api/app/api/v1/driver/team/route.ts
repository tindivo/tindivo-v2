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
            //
            // `picked_up_at` SÍ entra, y no contradice lo anterior. Es lo que
            // hace que la tarjeta "En reparto" tenga reloj como todas las demás
            // de la app; sin él era la única que salía sin tiempo y parecía rota.
            // No abre el vector de `estimated_ready_at` por dos razones: no dice
            // nada de cuándo estará lista la comida, y solo existe en pedidos ya
            // recogidos — que NO son traspasables (`respond_order_transfer`
            // exige `heading_to_restaurant` o `waiting_at_restaurant`). O sea
            // que no se puede usar para elegir qué pedir, porque esos pedidos no
            // se pueden pedir.
            //
            // `created_at` es el otro, y da el reloj de las tarjetas que TODAVÍA
            // se pueden pedir. Es la edad del pedido —cuánto lleva esperando el
            // cliente—, no cuándo estará listo, así que tampoco abre el vector:
            // un pedido viejo puede serlo porque la cocina va lenta, que es
            // razón para NO quedárselo. Y sin él, la mitad de las tarjetas de
            // Equipo salían sin tiempo mientras todas las demás de la app lo
            // tienen.
            'id,short_id,status,source,delivery_reference,customer_name,order_amount,delivery_fee,occupancy_slots,urgent_since,created_at,picked_up_at,driver_id,drivers(id,full_name,vehicle_type),businesses(name,accent_color)',
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
            //
            // `to_driver` es el nombre del SOLICITANTE, sí, con `to_`: el RPC
            // nombra los lados por el viaje del PEDIDO, no por el de la
            // petición (0043:276 inserta `from = dueño actual`,
            // `to = quien lo pide`). Viene embebido, y no en un `select`
            // aparte, para ahorrar el cuarto salto en serie de un endpoint que
            // se llama cada 15 s.
            //
            // El `!order_transfer_requests_to_driver_id_fkey` NO es adorno:
            // esta tabla tiene DOS claves foráneas a `drivers`
            // (`from_driver_id` y `to_driver_id`), así que sin nombrar la
            // constraint PostgREST no sabe por cuál embeber y responde 300
            // (ambiguous embed). Si alguna vez se renombra la FK, se renombra aquí.
            'id,order_id,from_driver_id,to_driver_id,status,reason,expires_at,created_at,orders(short_id,delivery_reference,order_amount,delivery_fee,businesses(name)),to_driver:drivers!order_transfer_requests_to_driver_id_fkey(full_name)',
          )
          .eq('status', 'pending')
          .gt('expires_at', nowIso)
          .or(`from_driver_id.eq.${driver.id},to_driver_id.eq.${driver.id}`),
      ])
    if (teamErr) throw new Error(teamErr.message)
    if (pendErr) throw new Error(pendErr.message)

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
          createdAt: o.created_at,
          pickedUpAt: o.picked_up_at,
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
          customerName: o.customer_name ?? null,
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
            requesterName: r.to_driver?.full_name ?? 'Compañero',
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
