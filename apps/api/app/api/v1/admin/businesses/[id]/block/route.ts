import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  reason: z.string().trim().min(1).max(200),
  /**
   * Marca la suspensión como «por deuda» (0180). Decide dos cosas río abajo: el
   * mensaje que lee el negocio en su pantalla de saldo, y si al pagar se le
   * levanta la suspensión solo (`settle_business_charges` exige esta marca).
   */
  forDebt: z.boolean().optional().default(false),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El admin suspende un negocio con motivo. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    // biome-ignore lint/suspicious/noExplicitAny: database.types.ts aún no trae p_for_debt
    const { data, error } = await (service as any).rpc('block_business', {
      p_id: id,
      p_reason: body.reason,
      p_by: user.id,
      p_for_debt: body.forDebt,
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
