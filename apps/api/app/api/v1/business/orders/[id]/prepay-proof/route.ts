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

/** El negocio obtiene una URL firmada para ver el comprobante de prepago de SU pedido. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { id } = await params
    const service = createServiceClient()
    const { data: biz } = await service
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const { data: order } = await service
      .from('orders')
      .select('business_id,comprobante_prepago_url')
      .eq('id', id)
      .maybeSingle()
    if (!order || !biz || order.business_id !== biz.id)
      throw new DomainError('Pedido no encontrado', 'not_found')
    if (!order.comprobante_prepago_url) return ok({ url: null }, { headers: corsHeaders(req) })

    const { data: signed } = await service.storage
      .from('payment-proofs')
      .createSignedUrl(order.comprobante_prepago_url, 120)
    return ok({ url: signed?.signedUrl ?? null }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
