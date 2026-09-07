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
 * strike (validación humana por llamada).
 *
 * El flujo de RECOJO (0219/0220) comparte todo el tramo de arriba y se separa
 * al salir de cocina, donde no hay motorizado a quien esperar:
 *
 *   [validando] -> pending_acceptance -> preparing
 *     -> ready_for_pickup -> delivered
 *
 * Un recojo «ahora» —el cliente está en el mostrador— no pasa por `validando`
 * aunque sea su primer pedido: la verificación la hace la cajera mirándolo
 * antes de aceptar, y hasta que acepta nadie ha cocinado nada.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  validando: ['pending_acceptance', 'confirmed', 'awaiting_payment', 'cancelled'],
  pending_acceptance: ['confirmed', 'awaiting_payment', 'cancelled'],
  awaiting_payment: ['validando', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['waiting_driver', 'heading_to_restaurant', 'ready_for_pickup', 'cancelled'],
  waiting_driver: ['heading_to_restaurant', 'cancelled'],
  heading_to_restaurant: ['waiting_at_restaurant', 'cancelled'],
  waiting_at_restaurant: ['picked_up', 'cancelled'],
  picked_up: ['delivered', 'cancelled'],
  // Solo dos salidas, y ninguna vuelve a cocina: la comida ya está hecha. O se
  // la lleva el cliente (`delivered`, terminal compartido con delivery — de eso
  // depende que un recojo habilite contraentrega después, ver DECISIONS §8), o
  // no vino nadie y la cajera lo cierra con `pickup_no_show`, que cancela.
  ready_for_pickup: ['delivered', 'cancelled'],
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
 * Proyección estado-backend -> paso de tracking del cliente (4 pasos + cancelado).
 * El cliente ve solo: Pedido recibido · Preparando · En camino · Entregado (los
 * estados `validando`/`pending_acceptance`/`confirmed` se colapsan en "recibido").
 * Resuelve la contradicción entre el vocabulario rico del backend (que las apps
 * de staff necesitan) y la vista simple que ve el cliente. Ver DECISIONS.md
 * "Máquina de estados".
 */
export const STATUS_TO_TRACKING: Record<OrderStatus, TrackingStep> = {
  validando: 'received',
  pending_acceptance: 'received',
  awaiting_payment: 'received',
  confirmed: 'received',
  preparing: 'preparing',
  waiting_driver: 'preparing',
  heading_to_restaurant: 'preparing',
  waiting_at_restaurant: 'preparing',
  picked_up: 'ontheway',
  // El tercer paso es POSICIONAL —«salió de cocina, todavía no está en manos
  // del cliente»—, no «va en una moto». Un recojo listo en el mostrador ocupa
  // ese sitio; lo que cambia es la palabra, y esa la elige `stepsFor()` en el
  // cliente según el método. Meterlo en `preparing` habría dejado el stepper
  // clavado en «Preparando» con la comida ya hecha esperando al cliente.
  ready_for_pickup: 'ontheway',
  delivered: 'delivered',
  cancelled: 'cancelled',
}

export function toTrackingStep(status: OrderStatus): TrackingStep {
  return STATUS_TO_TRACKING[status]
}
