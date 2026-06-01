import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({ available: z.boolean() })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Disponibilidad actual del motorizado + si la plataforma está en horario. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const service = createServiceClient()
    const { data: drv } = await service
      .from('drivers')
      .select('id,driver_availability(is_available)')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!drv) throw new DomainError('Motorizado no encontrado', 'not_found')
    const avail = drv.driver_availability as
      | { is_available?: boolean }
      | { is_available?: boolean }[]
      | null
    const isAvailable = Array.isArray(avail)
      ? Boolean(avail[0]?.is_available)
      : Boolean(avail?.is_available)
    const { data: within } = await service.rpc('is_within_platform_schedule')
    return ok(
      { available: isAvailable, withinSchedule: Boolean(within) },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Activa/desactiva la disponibilidad (activarse exige estar dentro del horario operativo). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('set_driver_availability', {
      p_user_id: user.id,
      p_available: body.available,
    })
    if (error) {
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
