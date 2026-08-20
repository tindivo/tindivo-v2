import { type OrderStatus, toTrackingStep } from '@tindivo/contracts'
import type { ChimeTone } from '@/features/tracking/lib/chime'
import type { Tracking } from '@/features/tracking/types'

/**
 * Qué merece avisar al cliente mientras mira el seguimiento, y con qué tono.
 *
 * La proyección de 4 pasos que ve el cliente (`toTrackingStep`) no sirve tal
 * cual para esto: colapsa `validando`, `pending_acceptance`, `awaiting_payment` y
 * `confirmed` en un mismo "recibido", y ahí dentro está justamente el aviso que
 * más importa — «ya puedes pagar». Así que esta lista es más fina que los pasos
 * y más gruesa que `ORDER_STATUSES`: un aviso por cosa que el cliente notaría.
 *
 * `arrived` no es un estado del pedido sino la marca `arrived_at_customer_at`.
 * Va aquí porque para el cliente es el momento más urgente de todos: el
 * motorizado está en su puerta.
 */
export type TrackingSignal =
  | 'waiting'
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing'
  | 'ontheway'
  | 'arrived'
  | 'delivered'
  | 'cancelled'

export interface TrackingAlert {
  tone: ChimeTone
  /** Lo que se dice en el toast y en el título de la pestaña. */
  message: string
}

export function trackingSignal(data: Tracking): TrackingSignal {
  if (data.status === 'cancelled') return 'cancelled'
  if (data.status === 'delivered') return 'delivered'
  if (data.arrivedAtCustomerAt) return 'arrived'
  if (data.status === 'awaiting_payment') return 'awaiting_payment'
  if (data.status === 'confirmed') return 'confirmed'

  const step = toTrackingStep(data.status as OrderStatus)
  if (step === 'ontheway') return 'ontheway'
  if (step === 'preparing') return 'preparing'
  return 'waiting'
}

/**
 * El aviso que corresponde a llegar a `signal`, o `null` si no hay ninguno.
 *
 * Depende solo del destino, no de dónde venía. Un pedido puede saltarse estados
 * (la cajera acepta y manda a cocina de un tirón, `waiting_driver` se salta
 * cuando el motorizado ya está en el local) y hacer depender el aviso de la
 * pareja origen-destino significaría perderlo justo en esos casos.
 *
 * `waiting` no avisa: es donde nace el pedido. Y `validando` con comprobante
 * tampoco, aunque sea un cambio de estado — lo provoca el propio cliente al
 * subir la captura, está mirando la pantalla, y un pitido por algo que acaba de
 * hacer con el dedo solo enseña que los avisos son ruido.
 */
export function alertFor(signal: TrackingSignal, prepaid: boolean): TrackingAlert | null {
  switch (signal) {
    case 'awaiting_payment':
      // El único aviso que el cliente puede perder con consecuencias: si no
      // paga dentro de su ventana, el pedido se cancela solo.
      return { tone: 'action', message: 'El restaurante confirmó. Ya puedes pagar tu pedido' }
    case 'confirmed':
      return {
        tone: 'good',
        message: prepaid ? 'Tu pago fue verificado' : 'El restaurante confirmó tu pedido',
      }
    case 'preparing':
      return { tone: 'good', message: 'Tu pedido ya está en cocina' }
    case 'ontheway':
      return { tone: 'good', message: 'Tu pedido salió. El motorizado va en camino' }
    case 'arrived':
      return { tone: 'action', message: '¡El motorizado llegó a tu domicilio!' }
    case 'delivered':
      return { tone: 'good', message: '¡Pedido entregado! Buen provecho' }
    case 'cancelled':
      return { tone: 'bad', message: 'Tu pedido fue cancelado' }
    default:
      return null
  }
}
