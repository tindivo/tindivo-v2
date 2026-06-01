import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Datos para que el cliente prepague: Yape del negocio + monto. Solo el dueño del pedido. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { id } = await params
    const service = createServiceClient()
    const { data: order } = await service
      .from('orders')
      .select(
        'order_amount,delivery_fee,business_id,customer_user_id,status,comprobante_prepago_url',
      )
      .eq('id', id)
      .maybeSingle()
    if (!order || order.customer_user_id !== user.id)
      throw new DomainError('Pedido no encontrado', 'not_found')
    const { data: biz } = await service
      .from('businesses')
      .select('name,yape_number,plin_number,qr_url')
      .eq('id', order.business_id)
      .single()
    return ok(
      {
        businessName: biz?.name ?? '',
        yapeNumber: biz?.yape_number ?? biz?.plin_number ?? null,
        qrUrl: biz?.qr_url ?? null,
        total: Number(order.order_amount) + Number(order.delivery_fee),
        status: order.status,
        hasProof: Boolean(order.comprobante_prepago_url),
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
