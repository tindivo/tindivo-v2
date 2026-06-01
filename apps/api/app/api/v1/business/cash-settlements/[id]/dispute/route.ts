import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  reportedAmount: z.number().nonnegative(),
  note: z.string().trim().min(1).max(500),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio reporta una diferencia de efectivo (va a la bandeja del admin). */
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
    const { data, error } = await service.rpc('dispute_cash_settlement', {
      p_id: id,
      p_business_user_id: user.id,
      p_reported_amount: body.reportedAmount,
      p_note: body.note,
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
