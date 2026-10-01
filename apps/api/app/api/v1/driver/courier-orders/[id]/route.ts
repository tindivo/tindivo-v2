import type { DriverCourierDetail } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  DRIVER_COURIER_COLUMNS,
  type DriverCourierRow,
  toDriverCourierView,
} from '@/lib/mappers/courier-driver'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * La ficha de una entrega. El motorizado la ve si está libre para aceptar
 * (sin celulares, como en el tablero) o si es suya, en cualquier estado (con
 * celulares). Cualquier otra se ve como inexistente: no se filtra cuál es cuál.
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

    const [{ data: driver }, { data: row, error }, { data: timers }] = await Promise.all([
      service.from('drivers').select('id').eq('user_id', user.id).maybeSingle(),
      service.from('courier_orders').select(DRIVER_COURIER_COLUMNS).eq('id', id).maybeSingle(),
      service.from('app_settings').select('value').eq('key', 'timers').maybeSingle(),
    ])
    if (error) throw new Error(error.message)
    if (!driver) throw new DomainError('Motorizado no encontrado', 'not_found')

    const r = row as DriverCourierRow | null
    const mine = r?.driver_id === driver.id
    const available = r?.status === 'requested' && r.driver_id === null
    if (!r || (!mine && !available))
      throw new DomainError('No encontramos esa entrega.', 'not_found')

    const acceptMinutes =
      (timers?.value as { courierAcceptMinutes?: number } | null)?.courierAcceptMinutes ?? 15
    const body: DriverCourierDetail = {
      order: toDriverCourierView(r, mine, acceptMinutes),
      mine,
    }
    return ok(body, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
