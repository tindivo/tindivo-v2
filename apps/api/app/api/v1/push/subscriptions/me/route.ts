import { z } from 'zod'
import { requireUser } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireUser(req)
    const url = new URL(req.url)
    const endpoint = z.string().url().max(1000).parse(url.searchParams.get('endpoint'))
    const service = createServiceClient()

    const { data, error } = await service
      .from('push_subscriptions')
      .select('user_id')
      .eq('endpoint', endpoint)
      .maybeSingle()

    if (error) throw new Error(error.message)

    return ok(
      { owned: data ? data.user_id === user.id : false, exists: Boolean(data) },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}
