import { z } from 'zod'
import { requireUser } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const SubSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
  userAgent: z.string().max(400).optional(),
})
const DeleteSchema = z.object({ endpoint: z.string().url().max(1000) })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Registra (o reactiva) la suscripción push del dispositivo del usuario. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireUser(req)
    const body = SubSchema.parse(await req.json())
    const service = createServiceClient()
    const { error } = await service.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.userAgent ?? null,
        failure_count: 0,
        last_failed_at: null,
      },
      { onConflict: 'user_id,endpoint' },
    )
    if (error) throw new Error(error.message)
    return ok({ subscribed: true }, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Da de baja la suscripción de este dispositivo (al revocar permiso o cerrar sesión). */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireUser(req)
    const body = DeleteSchema.parse(await req.json())
    const service = createServiceClient()
    const { error } = await service
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', body.endpoint)
    if (error) throw new Error(error.message)
    return ok({ unsubscribed: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
