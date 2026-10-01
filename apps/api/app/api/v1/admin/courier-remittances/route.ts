import type { AdminCourierRemittanceItem } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  COURIER_DEBT_COLUMNS,
  type CourierDebtRow,
  toCourierDebtItem,
} from '@/lib/mappers/courier-driver'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * La deuda viva de Entregas de todos los motorizados (0237): lo cobrado que
 * Jesús todavía no confirmó. Las que el motorizado ya marcó como entregadas
 * van primero: son las que esperan su «Confirmar».
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('courier_orders')
      .select(`${COURIER_DEBT_COLUMNS},drivers(full_name)`)
      .not('transport_collected_at', 'is', null)
      .is('remittance_confirmed_at', null)
      .order('transport_collected_at', { ascending: true })
    if (error) throw new Error(error.message)

    const rows = data as unknown as (CourierDebtRow & { drivers: { full_name: string } | null })[]
    const items: AdminCourierRemittanceItem[] = rows
      .map((r) => ({ ...toCourierDebtItem(r), driverName: r.drivers?.full_name ?? 'Motorizado' }))
      .sort((a, b) => (a.state === b.state ? 0 : a.state === 'delivering' ? -1 : 1))
    return ok(items, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
