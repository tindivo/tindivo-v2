import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  status: z.enum(['resolved', 'dismissed']).default('resolved'),
  resolutionNote: z.string().trim().max(500).optional(),
  resolutionAction: z.enum(['refund_customer', 'none']).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El admin resuelve/descarta un reporte de la bandeja con una nota. */
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

    // Si se aprueba la apelación con reembolso al cliente, cargar la contingencia al restaurante
    if (body.status === 'resolved' && body.resolutionAction === 'refund_customer') {
      const { data: rep } = await service
        .from('reports')
        .select('id,order_id,type,evidence_url')
        .eq('id', id)
        .maybeSingle()

      if (rep?.order_id && rep.type === 'rejected_proof_disputed') {
        const { data: ord } = await service
          .from('orders')
          .select('order_amount,delivery_fee')
          .eq('id', rep.order_id)
          .maybeSingle()

        if (ord) {
          const total = Number(ord.order_amount) + Number(ord.delivery_fee)
          await service.rpc('create_contingency_advance', {
            p_order_id: rep.order_id,
            p_amount: total,
            p_reason: 'apelacion_pago_aprobada',
            p_proof_url: rep.evidence_url ?? undefined,
            p_actor_charged: 'restaurante',
            p_operator: user.id,
          })
        }
      }
    }

    const { data, error } = await service
      .from('reports')
      .update({
        status: body.status,
        resolution_note: body.resolutionNote ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'open')
      .select('id,status')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Reporte no encontrado o ya resuelto', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
