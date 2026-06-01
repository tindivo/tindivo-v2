import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  method: z.enum(['yape', 'transfer', 'cash']).default('yape'),
  note: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Marca una liquidación como pagada (registra el pago + desbloquea por mora). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json().catch(() => ({})))
    const service = createServiceClient()
    const { data, error } = await service.rpc('pay_settlement', {
      p_settlement_id: id,
      p_paid_by: user.id,
      p_method: body.method,
      p_note: body.note ?? undefined,
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
