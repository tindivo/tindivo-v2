import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { processPendingOutboxEvents } from '@/lib/outbox/processor'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  description: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El cliente apela el rechazo final de su comprobante de pago prepago. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'customer')
    const { id } = await params
    const body = Schema.parse(await req.json().catch(() => ({})))

    // Invocación a la RPC canónica de 2 parámetros usando el token JWT del cliente
    // El evento order/appeal.created se encola atómicamente en outbox_events dentro de la misma transacción SQL
    const client = createUserClient(token)
    const { data, error } = await client.rpc('create_appeal_report', {
      p_order_id: id,
      p_description: body.description ?? undefined,
    } as any)

    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }

    // Intentar despachar el outbox sin bloquear ni hacer fallar la respuesta HTTP del cliente
    processPendingOutboxEvents().catch((err: any) => console.warn('Outbox dispatch warning:', err))

    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
