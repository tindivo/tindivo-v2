import type { CourierStatus } from './enums'

/**
 * Máquina de estados de `courier_orders` (Tindivo Entregas). Tabla propia,
 * máquina propia — no la de `orders` (Docs/Encargos/03-plan-tecnico.md §1.2).
 *
 *   requested -> accepted -> heading_to_pickup -> at_pickup -> picked_up
 *     -> heading_to_dropoff -> delivered
 *   (cualquier estado no terminal -> cancelled)
 *
 * `release` (el motorizado suelta una entrega que aceptó, DECISIONS: «el reloj
 * no se reinicia») vuelve cualquiera de los tres primeros pasos aceptados a
 * `requested`, para que otro motorizado pueda tomarla.
 */
export const COURIER_TRANSITIONS: Record<CourierStatus, readonly CourierStatus[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['heading_to_pickup', 'requested', 'cancelled'],
  heading_to_pickup: ['at_pickup', 'requested', 'cancelled'],
  at_pickup: ['picked_up', 'requested', 'cancelled'],
  picked_up: ['heading_to_dropoff', 'cancelled'],
  heading_to_dropoff: ['delivered', 'cancelled'],
  // Terminal. Igual que `orders.status` (invariante 8 de CLAUDE.md): una vez
  // entregado no hay vuelta atrás, y ninguna transición de la lista de arriba
  // apunta aquí desde otro lado que no sea `heading_to_dropoff`.
  delivered: [],
  cancelled: [],
}

/** Estados terminales (no admiten más transiciones). */
export const COURIER_TERMINAL_STATUSES: readonly CourierStatus[] = ['delivered', 'cancelled']

export function isCourierTerminal(status: CourierStatus): boolean {
  return COURIER_TERMINAL_STATUSES.includes(status)
}

export function canCourierTransition(from: CourierStatus, to: CourierStatus): boolean {
  return COURIER_TRANSITIONS[from].includes(to)
}

/**
 * Proyección estado-backend -> paso de tracking del cliente (5 pasos + cancelado),
 * el stepper de `Seguir-2-confirmado.dc.html`: Pedido · Confirmado · Recogido ·
 * En camino · Entregado.
 */
export const COURIER_TRACKING_STEPS = [
  'requested',
  'confirmed',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
] as const
export type CourierTrackingStep = (typeof COURIER_TRACKING_STEPS)[number]

export const COURIER_STATUS_TO_TRACKING: Record<CourierStatus, CourierTrackingStep> = {
  requested: 'requested',
  accepted: 'confirmed',
  heading_to_pickup: 'confirmed',
  at_pickup: 'confirmed',
  picked_up: 'picked_up',
  heading_to_dropoff: 'on_the_way',
  delivered: 'delivered',
  cancelled: 'cancelled',
}

export function toCourierTrackingStep(status: CourierStatus): CourierTrackingStep {
  return COURIER_STATUS_TO_TRACKING[status]
}
