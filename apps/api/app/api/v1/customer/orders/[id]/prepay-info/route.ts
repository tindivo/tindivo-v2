import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { PAYMENT_QR_COLUMNS, toPaymentQrViews } from '@/lib/mappers/payment-qr'
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
        'order_amount,delivery_fee,business_id,customer_user_id,status,comprobante_prepago_url,proof_attempt,updated_at',
      )
      .eq('id', id)
      .maybeSingle()
    if (!order || order.customer_user_id !== user.id)
      throw new DomainError('Pedido no encontrado', 'not_found')
    const [{ data: biz }, { data: qrRows }] = await Promise.all([
      service
        .from('businesses')
        .select('name,yape_number,plin_number,default_payment_qr_slot')
        .eq('id', order.business_id)
        .single(),
      service
        .from('business_payment_qrs')
        .select(PAYMENT_QR_COLUMNS)
        .eq('business_id', order.business_id),
    ])
    // El negocio puede tener dos cuentas dadas de alta (0184), pero al cliente
    // solo le va la principal. El repuesto es para la puerta: si el QR impreso
    // no escanea, el motorizado necesita otra vía en el acto. Prepagando desde
    // casa no existe esa urgencia, y sí el riesgo de que el cliente pague a la
    // cuenta contra la que la cajera no está conciliando.
    const paymentQr = toPaymentQrViews(qrRows, biz?.default_payment_qr_slot ?? 1)[0] ?? null
    return ok(
      {
        businessName: biz?.name ?? '',
        // Se mantiene por compatibilidad: es el número del método principal, y
        // solo cae a las columnas sueltas del negocio si no hay ninguno dado
        // de alta todavía.
        yapeNumber: paymentQr?.accountNumber ?? biz?.yape_number ?? biz?.plin_number ?? null,
        qrUrl: paymentQr?.qrUrl ?? null,
        paymentQr,
        total: Number(order.order_amount) + Number(order.delivery_fee),
        status: order.status,
        hasProof: Boolean(order.comprobante_prepago_url),
        proofAttempt: order.proof_attempt ?? 0,
        comprobantePrepagoUrl: order.comprobante_prepago_url ?? null,
        awaitingPaymentAt: order.updated_at ?? null,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
