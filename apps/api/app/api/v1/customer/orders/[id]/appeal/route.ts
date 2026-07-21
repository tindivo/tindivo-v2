import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { toCustomerAppealDto } from '@/lib/mappers/appeal'
import { processPendingOutboxEvents } from '@/lib/outbox/processor'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  description: z.string().trim().max(500).optional(),
})

const OrderIdSchema = z.string().uuid()

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET: consulta el estado de la apelación del cliente.
 * Usa createUserClient(token) (RLS activa) + filtro explícito de customer_user_id
 * como doble barrera. Solo devuelve campos del CustomerAppealDto.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const { id } = await params
    const orderId = OrderIdSchema.parse(id)

    const client = createUserClient(token)
    const { data, error } = await client
      .from('reports')
      .select(
        'id, order_id, appeal_status, refund_status, refund_amount, refund_completed_at, appeal_deadline, description, status, created_at, updated_at, refund_proof_path',
      )
      .eq('order_id', orderId)
      .eq('type', 'rejected_proof_disputed')
      .eq('customer_user_id', user.id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Apelación no encontrada', 'not_found')

    // Generar URL firmada del comprobante de devolución si existe
    let refundProofUrl: string | null = null
    if (data.refund_proof_path) {
      const { data: signed } = await client.storage
        .from('payment-proofs')
        .createSignedUrl(data.refund_proof_path, 3600)
      refundProofUrl = signed?.signedUrl ?? null
    }

    return ok(toCustomerAppealDto({ ...data, refundProofUrl }), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
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
