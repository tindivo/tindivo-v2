import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) {
  return handleOptions(req)
}

export async function GET(req: Request) {
  const reqId = getRequestId(req)
  const headers = corsHeaders(req)
  try {
    const supabase = createServiceClient()

    const { data, error } = await (supabase.rpc as any)('get_order_intake_status')

    if (error || !data) {
      return ok(
        {
          isOpen: true,
          cutoff: '22:30',
          serverTimeLima: new Date().toISOString(),
          message: null,
        },
        { headers },
      )
    }

    return ok(data, { headers })
  } catch (err) {
    return handleError(err, reqId, req)
  }
}
