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
            'id,short_id,status,source,order_amount,delivery_fee,occupancy_slots,urgent_since,driver_id,drivers(id,full_name,vehicle_type),businesses(name)',
          )
          .neq('driver_id', driver.id)
          .not('driver_id', 'is', null)
          .in('status', ['heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'])
          .order('created_at', { ascending: false }),
        service
          .from('order_transfer_requests')
          .select(
            'id,order_id,from_driver_id,to_driver_id,status,reason,expires_at,created_at,orders(short_id,order_amount,delivery_fee,businesses(name))',
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
            requesterName: requesterName(r.to_driver_id),
            reason: r.reason,
            expiresAt: r.expires_at,
          })),
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
