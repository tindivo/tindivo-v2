import type { TrackingStep } from '@tindivo/contracts'
import type { Tracking } from '@/features/tracking/types'

export { soles } from '@/lib/format'

export const STEPS: { key: TrackingStep; label: string; sub: string }[] = [
  { key: 'received', label: 'Pedido recibido', sub: 'El restaurante te llamará para confirmar' },
  { key: 'preparing', label: 'Preparando', sub: 'Tu pedido está en cocina' },
  { key: 'ontheway', label: 'En camino', sub: 'Repartidor en ruta' },
  { key: 'delivered', label: 'Entregado', sub: '¡Buen provecho!' },
]

/**
 * Copy de la pantalla de cancelado (DECISIONS §estados / prototipo).
 *
 * Ramifica por método de pago además de por motivo: para un prepago con
 * comprobante subido, "no se te cobró nada" es falso — el dinero ya salió a la
 * cuenta del restaurante. Ninguno de estos textos promete ni niega una
 * devolución: la política está sin decidir, y prometer de más es peor que no
 * decir nada.
 */
export function cancelledCopy(
  reason: string | null,
  opts?: { paymentIntent?: string; proofUrl?: string | null },
): {
  eyebrow: string
  title: string
  body: string
} {
  // Pagó de verdad: prepago con comprobante subido.
  const yaPago = opts?.paymentIntent === 'prepaid' && Boolean(opts?.proofUrl)

  switch (reason) {
    case 'customer_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelaste tu pedido',
        body: yaPago
          ? 'Cancelaste tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Tu pedido fue cancelado sin costo porque aún no estaba confirmado por el restaurante. Puedes volver a pedir cuando quieras.',
      }
    case 'prepay_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Se acabó el tiempo para pagar',
        body: 'Tu pedido fue cancelado porque no recibimos tu comprobante a tiempo. Puedes volver a pedir cuando quieras.',
      }
    case 'validation_timeout':
    case 'pending_acceptance_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos confirmar tu pedido',
        body: yaPago
          ? 'El restaurante no respondió a tiempo, así que cancelamos tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'El restaurante no respondió a tiempo, así que cancelamos tu pedido sin costo. Puedes intentarlo de nuevo.',
      }
    case 'business_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'El restaurante canceló tu pedido',
        body: yaPago
          ? 'Lamentablemente el restaurante no pudo tomar tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Lamentablemente el restaurante no pudo tomar tu pedido. No se te cobró nada. Puedes pedir en otro momento.',
      }
    case 'admin_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelamos tu pedido',
        body: yaPago
          ? 'Tuvimos que cancelar tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Tuvimos que cancelar tu pedido. Si quieres saber qué pasó, escríbenos por WhatsApp.',
      }
    case 'proof_rejected_final':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos verificar tu pago',
        body: 'El restaurante no pudo confirmar el comprobante que enviaste. Si crees que hubo un error, escríbenos por WhatsApp.',
      }
    case 'no_show':
      // Sin acusar: el motorizado pudo no dar con la puerta, y el cliente pudo
      // no oír la llamada. Tampoco se menciona el dinero — la política está en
      // backlog y prometer una devolución que no está decidida sería peor.
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos entregarte el pedido',
        body: 'El motorizado llegó a la dirección y no logró encontrarte. El pedido volvió al restaurante. Escríbenos por WhatsApp y lo vemos contigo.',
      }
    default:
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Tu pedido fue cancelado',
        body: 'Tu pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.',
      }
  }
}

export function etaLabel(estimatedReadyAt: string | null): string {
  if (estimatedReadyAt) {
    const mins = Math.round((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000)
    if (mins > 0) return `~${mins} min`
  }
  return '25–35 min'
}

export function getStepSub(s: (typeof STEPS)[0], data: Tracking): string {
  if (s.key === 'received' && data.paymentIntent === 'prepaid') {
    if (data.status === 'pending_acceptance' || (data.status === 'validando' && !data.proofUrl)) {
      return 'Esperando confirmación de disponibilidad'
    }
    if (data.status === 'awaiting_payment') return 'Restaurante confirmó. Paga ahora'
    if (data.status === 'validando' && data.proofUrl) return 'Verificando tu comprobante de pago'
    if (data.status === 'confirmed') return 'Pago verificado. En preparación'
  }
  return s.sub
}

/** Mensaje informativo del footer según estado y método de pago. */
export function getStatusMessage(data: Tracking, current: TrackingStep | null): string {
  if (current === 'delivered') return '¡Tu pedido fue entregado! Buen provecho.'

  if (data.paymentIntent === 'prepaid') {
    if (data.status === 'pending_acceptance' || (data.status === 'validando' && !data.proofUrl)) {
      return 'El restaurante confirmará disponibilidad para que puedas realizar el pago.'
    }
    if (data.status === 'awaiting_payment') {
      return 'Realiza tu pago por Yape/Plin y sube tu comprobante para iniciar la preparación.'
    }
    if (data.status === 'validando' && data.proofUrl) {
      return 'Tu comprobante está en revisión por el restaurante.'
    }
    return 'Tu pedido ya está en preparación y no puede cancelarse.'
  }

  // Contraentrega en revisión. Antes caía al mensaje genérico de abajo, que
  // afirmaba dos cosas falsas: que estaba en preparación (está en `validando`)
  // y que no podía cancelarse (cancel_customer_order SÍ admite `validando`
  // para no-prepago, 0046:25-27).
  if (data.status === 'validando') {
    return 'El restaurante te llamará para confirmar tu pedido antes de prepararlo. Aún puedes cancelarlo.'
  }
  if (data.status === 'pending_acceptance') {
    return 'El restaurante está confirmando tu pedido. Aún puedes cancelarlo.'
  }

  return 'Tu pedido ya está en preparación y no puede cancelarse.'
}

/** La ventana de cancelación del cliente es ANTES de la confirmación del negocio
 *  (DECISIONS §5). Se basa en el estado crudo, no en el bucket "recibido" (que ya
 *  incluye `confirmed`), para no ofrecer cancelar un pedido ya confirmado. */
export function isCancellable(data: Tracking, ownedId: string | null): boolean {
  return (
    (data.status === 'validando' || data.status === 'pending_acceptance') &&
    Boolean(ownedId) &&
    data.paymentIntent !== 'prepaid'
  )
}
