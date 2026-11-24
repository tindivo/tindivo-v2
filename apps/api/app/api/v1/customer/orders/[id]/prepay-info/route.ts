import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { PAYMENT_QR_COLUMNS, toPaymentQrViews } from '@/lib/mappers/payment-qr'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/** Estados en los que el negocio ya aceptó el pedido con entrega (donde el pago único admite captura). */
const ACCEPTED = [
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
]

function centsToText(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/**
 * Qué puede hacer el cliente con la captura. La regla del servidor, no la de la app: en el prepago
 * la captura es obligatoria y solo se sube esperando el pago; en el pago único del cliente de
 * confianza es opcional y se admite con el pedido aceptado, mientras el negocio no confirme el
 * ingreso. En los dos casos, dos intentos.
 */
function proofState(order: {
  status: string
  payment_intent: string
  delivery_method: string
  proof_attempt: number | null
  payment_proof_status: string | null
  payment_verified_at: string | null
}) {
  const attemptsLeft = (order.proof_attempt ?? 0) < 2
  const single = order.payment_intent === 'pending_yape' && order.delivery_method === 'delivery'
  const canUploadProof = single
    ? ACCEPTED.includes(order.status) && order.payment_verified_at === null && attemptsLeft
    : order.payment_intent === 'prepaid' && order.status === 'awaiting_payment' && attemptsLeft
  return {
    proofOptional: single,
    canUploadProof,
    paymentProofStatus: order.payment_proof_status ?? null,
    paymentVerifiedAt: order.payment_verified_at
      ? new Date(order.payment_verified_at).toISOString()
      : null,
  }
}

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
        'order_amount,delivery_fee,business_id,customer_user_id,status,comprobante_prepago_url,proof_attempt,updated_at,payment_intent,delivery_method,payment_proof_status,payment_verified_at',
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
        // `total` sigue siendo número por compatibilidad (invariante 13 lo prohíbe en campos
        // nuevos); el código nuevo lee `totalText`, que se suma en céntimos enteros.
        total: Number(order.order_amount) + Number(order.delivery_fee),
        totalText: centsToText(
          Math.round(Number(order.order_amount) * 100) +
            Math.round(Number(order.delivery_fee) * 100),
        ),
        status: order.status,
        hasProof: Boolean(order.comprobante_prepago_url),
        proofAttempt: order.proof_attempt ?? 0,
        comprobantePrepagoUrl: order.comprobante_prepago_url ?? null,
        awaitingPaymentAt: order.updated_at ?? null,
        ...proofState(order),
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
