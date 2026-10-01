import type { DriverCourierBoard } from '@tindivo/contracts'
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
 * Tablero de Tindivo Entregas del motorizado: las solicitudes sin tomar y las
 * suyas en curso. La RLS de `courier_orders` solo le deja ver las asignadas
 * (0232), así que la lectura va con service role y la autorización vive aquí.
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

    const [availableRes, mineRes, settingsRes] = await Promise.all([
      service
        .from('courier_orders')
        .select(DRIVER_COURIER_COLUMNS)
        .eq('status', 'requested')
        .is('driver_id', null)
        .order('created_at', { ascending: true })
        .limit(20),
      service
        .from('courier_orders')
        .select(DRIVER_COURIER_COLUMNS)
        .eq('driver_id', driver.id)
        .not('status', 'in', '(delivered,cancelled)')
        .order('accepted_at', { ascending: true }),
      // Una sola lectura para las dos claves: este endpoint se pide cada 15 s
      // por motorizado.
      service.from('app_settings').select('key,value').in('key', ['courier', 'timers']),
    ])
    if (availableRes.error) throw new Error(availableRes.error.message)
    if (mineRes.error) throw new Error(mineRes.error.message)

    const setting = (key: string) => settingsRes.data?.find((r) => r.key === key)?.value ?? {}
    const settings = setting('courier') as { maxActivePerDriver?: number }
    // El mismo ajuste que lee `expire_courier_orders`: el reloj de la tarjeta
    // vence cuando la base cancela, no antes ni después.
    const timers = setting('timers') as { courierAcceptMinutes?: number }
    const acceptMinutes = timers.courierAcceptMinutes ?? 15
    const board: DriverCourierBoard = {
      available: (availableRes.data as DriverCourierRow[]).map((r) =>
        toDriverCourierView(r, false, acceptMinutes),
      ),
      mine: (mineRes.data as DriverCourierRow[]).map((r) =>
        toDriverCourierView(r, true, acceptMinutes),
      ),
      maxActivePerDriver: settings.maxActivePerDriver ?? 2,
    }
    return ok(board, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
