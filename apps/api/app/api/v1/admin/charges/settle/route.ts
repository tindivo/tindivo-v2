import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  business_id: z.string().uuid(),
  charge_ids: z.array(z.string().uuid()).min(1),
  total_amount: z.number().positive(),
  payment_method: z.enum(['yape', 'plin', 'efectivo', 'otro']).default('yape'),
  note: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Liquida cargos seleccionados de un negocio (RPC settle_business_charges) */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()

    // biome-ignore lint/suspicious/noExplicitAny: RPC added in migration
    const { data, error } = await (service as any).rpc('settle_business_charges', {
      p_business_id: body.business_id,
      p_charge_ids: body.charge_ids,
      p_total_amount: body.total_amount,
      p_payment_method: body.payment_method,
      p_note: body.note ?? undefined,
      p_admin_user_id: user.id,
    })

    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }

    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
