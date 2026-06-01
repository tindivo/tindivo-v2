import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  pass: z.boolean(),
  reason: z.string().trim().max(200).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio valida (llamada OK) o rechaza un pedido en `validando`. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('validate_order', {
      p_order_id: id,
      p_actor_user_id: user.id,
      p_actor_role: 'business',
      p_pass: body.pass,
      p_reason: body.reason ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }
    // Al pasar la validación, arranca el timer de aceptación (best-effort).
    const result = data as { ok?: boolean; status?: string }
    if (result?.status === 'pending_acceptance') {
      try {
        await sendOrderCreated({ orderId: id })
      } catch {}
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
