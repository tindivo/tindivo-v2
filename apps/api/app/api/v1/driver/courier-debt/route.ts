import { type DriverCourierDebt, DriverCourierRemitRequestSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  COURIER_DEBT_COLUMNS,
  COURIER_DEBT_ERRORS,
  type CourierDebtRow,
  toCourierDebtItem,
} from '@/lib/mappers/courier-driver'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Lo que el motorizado le debe a Tindivo por Entregas (0237): cada entrega
 * cobrada —Yape o efectivo— que Jesús todavía no confirmó.
 *
 * SIN CORTE POR NOCHE, igual que el efectivo de la comida: una deuda de ayer
 * sin confirmar sigue siendo deuda, y no puede desaparecer a medianoche.
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
      .select(COURIER_DEBT_COLUMNS)
      .eq('driver_id', driver.id)
      .not('transport_collected_at', 'is', null)
      .is('remittance_confirmed_at', null)
      .order('transport_collected_at', { ascending: true })
    if (error) throw new Error(error.message)

    const body: DriverCourierDebt = {
      items: (data as CourierDebtRow[]).map(toCourierDebtItem),
    }
    return ok(body, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** «Entregar»: el motorizado dice que ya le dio a Tindivo lo de una entrega. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const body = DriverCourierRemitRequestSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('driver_remit_courier_fee', {
      p_courier_order_id: body.courierOrderId,
      p_actor_user_id: user.id,
    })
    if (error) {
      const known = COURIER_DEBT_ERRORS[error.message.split(':')[0] ?? '']
      if (error.code === 'P0001' && known) throw new DomainError(known.detail, known.code)
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
