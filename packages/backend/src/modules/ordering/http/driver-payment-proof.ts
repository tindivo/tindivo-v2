import { DriverPaymentProofSchema, UuidSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'

const BUCKET = 'payment-proofs'
/** La firma dura lo que tarda en mirarla en la puerta; no es un enlace para guardar (decisión 5). */
const SIGNED_SECONDS = 120

/**
 * El motorizado ASIGNADO ahora ve la captura del pago único mientras el pedido siga vivo. Nunca la
 * aprueba (CUS-PAY-014): solo la mira para saber si el cliente ya pagó. Cualquier otro caso (no es
 * suyo, ya terminó, no hay captura, no es un pago único) responde 404 igual, para no enumerar pedidos.
 */
export const driverPrepayProofHandler = defineHandler(
  {
    module: 'ordering',
    method: 'GET',
    path: '/api/v1/driver/orders/{id}/prepay-proof',
    auth: 'user',
    params: z.object({ id: UuidSchema }),
    response: DriverPaymentProofSchema,
  },
  async ({ actor, params, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('driver')) throw new DomainError('No autorizado', 'forbidden')
    const db = deps.supabase()
    const notFound = () => new DomainError('Pedido no encontrado', 'not_found')

    const { data: driver } = await db
      .from('drivers')
      .select('id')
      .eq('user_id', actor.userId)
      .maybeSingle()
    if (!driver) throw notFound()

    const { data: order } = await db
      .from('orders')
      .select('driver_id,status,payment_intent,comprobante_prepago_url,payment_proof_status')
      .eq('id', params.id.toLowerCase())
      .maybeSingle()
    if (
      !order ||
      order.driver_id !== driver.id ||
      order.payment_intent !== 'pending_yape' ||
      order.status === 'delivered' ||
      order.status === 'cancelled' ||
      !order.comprobante_prepago_url ||
      !order.payment_proof_status
    ) {
      throw notFound()
    }

    const { data: signed, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(order.comprobante_prepago_url, SIGNED_SECONDS)
    if (error || !signed) {
      // Sin el texto de Storage: puede traer la URL o el token.
      throw new Error('No se pudo firmar la captura', { cause: error ?? undefined })
    }
    return {
      url: signed.signedUrl,
      expiresInSeconds: SIGNED_SECONDS,
      paymentProofStatus: order.payment_proof_status as 'pending' | 'verified' | 'rejected',
    }
  },
)
