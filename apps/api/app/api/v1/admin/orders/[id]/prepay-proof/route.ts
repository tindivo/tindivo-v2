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

/**
 * URL firmada del comprobante de prepago, para el admin.
 *
 * Mismo patrón que el del negocio (`business/orders/[id]/prepay-proof`), con
 * una diferencia: allí la autorización es la propiedad del pedido —el negocio
 * solo ve los suyos— y aquí es el rol. El admin los ve todos, que es el punto:
 * el caso de uso es "el cliente dice que pagó" a las 22:40.
 *
 * El bucket `payment-proofs` es privado y no se toca ninguna política: la que
 * ya existe (`storage admin all`) cubre al admin. Se firma con el service
 * client, igual que el negocio, para no depender de la sesión del navegador.
 *
 * TTL de 120 segundos, el mismo del patrón existente. Es una URL que da acceso
 * a la captura de un pago: dura lo que tarda en pintarse la imagen, no lo que
 * tarde la pestaña en cerrarse. Si caduca, se recarga.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()

    const { data: order } = await service
      .from('orders')
      .select('comprobante_prepago_url')
      .eq('id', id)
      .maybeSingle()
    if (!order) throw new DomainError('Pedido no encontrado', 'not_found')
    if (!order.comprobante_prepago_url) return ok({ url: null }, { headers: corsHeaders(req) })

    const { data: signed } = await service.storage
      .from('payment-proofs')
      .createSignedUrl(order.comprobante_prepago_url, 120)
    return ok({ url: signed?.signedUrl ?? null }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
