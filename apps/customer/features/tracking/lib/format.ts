import type { TrackingStep } from '@tindivo/contracts'
import type { Tracking } from '@/features/tracking/types'

export { soles } from '@/lib/format'

export const STEPS: { key: TrackingStep; label: string; sub: string }[] = [
  { key: 'received', label: 'Pedido recibido', sub: 'El restaurante te llamará para confirmar' },
  { key: 'preparing', label: 'Preparando', sub: 'Tu pedido está en cocina' },
  { key: 'ontheway', label: 'En camino', sub: 'Repartidor en ruta' },
  { key: 'delivered', label: 'Entregado', sub: '¡Buen provecho!' },
]

/** Copy de la pantalla de cancelado según el motivo (DECISIONS §estados / prototipo). */
export function cancelledCopy(reason: string | null): {
  eyebrow: string
  title: string
  body: string
} {
  switch (reason) {
    case 'customer_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelaste tu pedido',
        body: 'Tu pedido fue cancelado sin costo porque aún no estaba confirmado por el restaurante. Puedes volver a pedir cuando quieras.',
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
        body: 'El restaurante no respondió a tiempo, así que cancelamos tu pedido sin costo. Puedes intentarlo de nuevo.',
      }
    case 'business_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'El restaurante canceló tu pedido',
        body: 'Lamentablemente el restaurante no pudo tomar tu pedido. No se te cobró nada. Puedes pedir en otro momento.',
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
