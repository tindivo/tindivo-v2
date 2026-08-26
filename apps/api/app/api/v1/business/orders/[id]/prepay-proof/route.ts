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
    // Las dos lecturas no dependen una de otra, y en fila costaban dos viajes
    // enteros dentro del camino crítico de la cajera: hasta que esto no vuelve,
    // la imagen del comprobante ni siquiera empieza a bajar.
    const [{ data: biz }, { data: order }] = await Promise.all([
      service.from('businesses').select('id').eq('user_id', user.id).maybeSingle(),
      service
        .from('orders')
        .select('business_id,comprobante_prepago_url')
        .eq('id', id)
        .maybeSingle(),
    ])
    if (!order || !biz || order.business_id !== biz.id)
      throw new DomainError('Pedido no encontrado', 'not_found')
    if (!order.comprobante_prepago_url) return ok({ url: null }, { headers: corsHeaders(req) })

    if (
      order.comprobante_prepago_url.startsWith('http://') ||
      order.comprobante_prepago_url.startsWith('https://')
    ) {
      return ok({ url: order.comprobante_prepago_url }, { headers: corsHeaders(req) })
    }

    /*
      DIEZ MINUTOS, Y ANTES ERAN DOS.

      Cada firma es un token distinto —el `exp` se mueve—, así que la URL
      cambiaba en cada apertura y el `max-age` de un año con el que se sube el
      comprobante no se aprovechaba nunca: la cajera rebajaba los ~100 KB cada
      vez que abría el mismo pedido. Con la firma viva diez minutos, el cliente
      la reutiliza (`features/pedidos/lib/proof-url.ts`) y la segunda apertura
      la sirve el caché del navegador.

      El plazo sigue siendo corto a propósito: es una credencial de lectura
      sobre el comprobante de pago de un cliente, no un enlace público.
    */
    const { data: signed } = await service.storage
      .from('payment-proofs')
      .createSignedUrl(order.comprobante_prepago_url, 600)
    return ok({ url: signed?.signedUrl ?? null }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
