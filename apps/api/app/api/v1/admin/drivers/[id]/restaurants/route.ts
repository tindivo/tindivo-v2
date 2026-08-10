import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Locales que atiende un motorizado (`driver_restaurants`).
 *
 * POR QUÉ ESTE ENDPOINT EXISTE.
 * Sin una fila aquí el motorizado NO VE los pedidos de ese local: la policy
 * `ord_driver_read` filtra los pedidos sin dueño por
 * `business_id IN (SELECT business_id FROM driver_restaurants WHERE ...)`.
 * Hasta ahora la tabla solo se leía — ninguna pantalla la escribía — así que
 * un motorizado dado de alta desde el panel abría su app y no veía nada, sin
 * error ni pista. Le pasó a Ernesto.
 *
 * El nombre de la ruta dice `restaurants` y no `businesses` a propósito: es el
 * de la tabla, que v2 heredó del v1 sin renombrar aunque la entidad aquí se
 * llame `businesses`. Cambiarle el nombre a la ruta sin renombrar la tabla
 * habría dejado dos vocabularios para lo mismo.
 */
const Schema = z.object({
  businessIds: z.array(z.uuid()),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Locales asignados hoy. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()
    const { data, error } = await service
      .from('driver_restaurants')
      .select('business_id')
      .eq('driver_id', id)
    if (error) throw new Error(error.message)
    return ok(
      { businessIds: (data ?? []).map((r) => r.business_id) },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * Reemplaza el conjunto completo de locales del motorizado.
 *
 * ORDEN DELIBERADO: primero se insertan los nuevos, después se borran los que
 * sobran. Al revés habría una ventana —corta, pero real— en la que el
 * motorizado se queda sin ningún local asignado; si en ese instante llega un
 * pedido, deja de verlo. Portado del v1, que documenta el mismo cuidado.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()

    const { data: driver } = await service.from('drivers').select('id').eq('id', id).maybeSingle()
    if (!driver) throw new DomainError('Motorizado no encontrado', 'not_found')

    const desired = Array.from(new Set(body.businessIds))

    if (desired.length > 0) {
      const { error: insertErr } = await service.from('driver_restaurants').upsert(
        desired.map((business_id) => ({ driver_id: id, business_id })),
        { onConflict: 'driver_id,business_id', ignoreDuplicates: true },
      )
      if (insertErr) throw new Error(insertErr.message)
    }

    let del = service.from('driver_restaurants').delete().eq('driver_id', id)
    if (desired.length > 0) del = del.not('business_id', 'in', `(${desired.join(',')})`)
    const { error: deleteErr } = await del
    if (deleteErr) throw new Error(deleteErr.message)

    return ok({ driverId: id, businessIds: desired }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
