import { canTransition, isTerminal, type OrderStatus, toTrackingStep } from '@tindivo/contracts'
import { InvalidStateTransitionError, OrderNotCancellableError } from '../shared/errors'

export { canTransition, isTerminal, toTrackingStep }

/** Valida la transición o lanza InvalidStateTransitionError. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to)
  }
}

/** Ventana de cancelación libre del cliente: 2 min desde la creación. */
export const CUSTOMER_CANCEL_WINDOW_MS = 2 * 60 * 1000

/**
 * El cliente puede cancelar libremente hasta que el negocio acepta O dentro de
 * los 2 min desde la creación — lo que ocurra PRIMERO (DECISIONS §5). Después
 * la cancelación va a la bandeja del admin.
 */
export function assertCustomerCanCancel(
  order: { status: OrderStatus; createdAt: Date },
  now: Date,
): void {
  const beforeConfirmation = order.status === 'validando' || order.status === 'pending_acceptance'
  const withinWindow = now.getTime() - order.createdAt.getTime() <= CUSTOMER_CANCEL_WINDOW_MS
  if (!(beforeConfirmation && withinWindow)) {
    throw new OrderNotCancellableError(
      'La ventana de cancelación del cliente ya cerró; el caso pasa a la bandeja del admin',
    )
  }
}
