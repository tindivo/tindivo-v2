import { type DriverCourierOrderView, serviceDayStart } from '@tindivo/contracts'
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
 * Las entregas que el motorizado entregó en la jornada de hoy (desde las
 * 05:00 de Lima, el mismo corte que la comida), la más reciente primero.
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

    const { data, error } = await service
      .from('courier_orders')
      .select(DRIVER_COURIER_COLUMNS)
      .eq('driver_id', driver.id)
      .eq('status', 'delivered')
      .gte('delivered_at', serviceDayStart())
      .order('delivered_at', { ascending: false })
    if (error) throw new Error(error.message)

    const delivered: DriverCourierOrderView[] = (data as DriverCourierRow[]).map((r) =>
      toDriverCourierView(r, false, 0),
    )
    return ok({ delivered }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
