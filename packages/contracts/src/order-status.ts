import type { OrderStatus, TrackingStep } from './enums'

/**
 * Máquina de estados del pedido (vista de transiciones permitidas, backend).
 * El flujo canónico de Fase 1 (delivery) es:
 *
 *   [validando] -> pending_acceptance -> confirmed -> preparing
 *     -> waiting_driver -> heading_to_restaurant -> waiting_at_restaurant
 *     -> picked_up -> delivered
 *   (cualquier estado no terminal -> cancelled)
 *
 * El estado `validando` solo aparece en contraentrega de cliente nuevo / con
 * strike (validación humana por llamada). `pickup` (inactivo en el piloto)
 * define sus propias transiciones cuando se active (ver DECISIONS.md).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  validando: ['pending_acceptance', 'cancelled'],
  pending_acceptance: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['waiting_driver', 'heading_to_restaurant', 'cancelled'],
  waiting_driver: ['heading_to_restaurant', 'cancelled'],
  heading_to_restaurant: ['waiting_at_restaurant', 'cancelled'],
  waiting_at_restaurant: ['picked_up', 'cancelled'],
  picked_up: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

/** Estados terminales (no admiten más transiciones). */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'cancelled']

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/**
 * Proyección estado-backend -> paso de tracking del cliente (5 pasos + cancelado).
 * Resuelve la contradicción entre el vocabulario rico del backend (que las apps
 * de staff necesitan) y la vista simple que ve el cliente. Ver DECISIONS.md
 * "Máquina de estados".
 */
export const STATUS_TO_TRACKING: Record<OrderStatus, TrackingStep> = {
  validando: 'sent',
  pending_acceptance: 'sent',
  confirmed: 'confirmed',
  preparing: 'preparing',
  waiting_driver: 'preparing',
  heading_to_restaurant: 'preparing',
  waiting_at_restaurant: 'preparing',
  picked_up: 'ontheway',
  delivered: 'delivered',
  cancelled: 'cancelled',
}

export function toTrackingStep(status: OrderStatus): TrackingStep {
  return STATUS_TO_TRACKING[status]
}
