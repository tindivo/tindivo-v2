import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// minutes: número (pausa temporal) · null/ausente: "hasta que reactive" (infinity).
const PauseSchema = z.object({
  minutes: z.number().int().min(1).max(720).nullable().optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio pausa la recepción de pedidos web (busy mode). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const body = PauseSchema.parse(await req.json().catch(() => ({})))
    const service = createServiceClient()
    const { data, error } = await service.rpc('pause_business_orders', {
      p_business_user_id: user.id,
      p_minutes: body.minutes ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** El negocio reanuda la recepción de pedidos web. */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const service = createServiceClient()
    const { data, error } = await service.rpc('resume_business_orders', {
      p_business_user_id: user.id,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
