import type { DeliveryMethod, DistanceBand, OrderStatus } from '@tindivo/contracts'
import { type CommissionConfig, type CommissionOverrides, computeCommission } from './commission'
import { assertTransition } from './state-machine'

/**
 * Operaciones de transición PURAS del agregado Order. Devuelven el delta de
 * estado a persistir; la infraestructura (apps/api) lo aplica vía repositorio.
 * No tocan la DB ni el reloj global (testeables).
 */

/** Recoger: el motorizado declara la banda (determina la comisión al entregar). */
export function applyPickedUp(
  order: { status: OrderStatus },
  band: DistanceBand,
): { status: OrderStatus; band: DistanceBand } {
  assertTransition(order.status, 'picked_up')
  return { status: 'picked_up', band }
}

/** Entregar: snapshot inmutable de la comisión total a Tindivo. */
export function applyDelivered(
  order: { status: OrderStatus; deliveryMethod: DeliveryMethod; band: DistanceBand | null },
  args: { config: CommissionConfig; overrides?: CommissionOverrides },
): { status: OrderStatus; tindivoCommission: number } {
  assertTransition(order.status, 'delivered')
  const tindivoCommission = computeCommission({
    deliveryMethod: order.deliveryMethod,
    band: order.band,
    config: args.config,
    overrides: args.overrides,
  })
  return { status: 'delivered', tindivoCommission }
}
