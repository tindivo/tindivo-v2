import {
  type CourierStatus,
  canCourierTransition,
  isCourierTerminal,
  toCourierTrackingStep,
} from '@tindivo/contracts'
import { InvalidStateTransitionError } from '../shared/errors'

export { canCourierTransition, isCourierTerminal, toCourierTrackingStep }

/** Valida la transición o lanza InvalidStateTransitionError. */
export function assertCourierTransition(from: CourierStatus, to: CourierStatus): void {
  if (!canCourierTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to)
  }
}

/**
 * Ventana de cancelación libre del cliente: hasta que un motorizado acepta
 * (`requested`), sin límite de minutos — a diferencia de `orders`, aquí no hay
 * cocina que ya empezó a trabajar mientras el pedido esperaba. Después de
 * `accepted` la cancelación es posible pero dejará al motorizado a medio
 * camino: se permite igual (el cliente manda), simplemente ya no es "gratis
 * e inmediata" desde la UI (el backend registra `cancel_reason`).
 */
export function assertCustomerCanCancelCourier(order: { status: CourierStatus }): void {
  if (isCourierTerminal(order.status)) {
    throw new InvalidStateTransitionError(order.status, 'cancelled')
  }
}
