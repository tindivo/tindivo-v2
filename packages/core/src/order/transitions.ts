import type { DistanceBand, OrderStatus } from '@tindivo/contracts'
import { assertTransition } from './state-machine'

/**
 * Operaciones de transición PURAS del agregado Order. Devuelven el delta de
 * estado a persistir; la infraestructura (apps/api) lo aplica vía repositorio.
 * No tocan la DB ni el reloj global (testeables).
 *
 * AQUÍ NO SE CALCULA DINERO. `applyDelivered` y el módulo `commission.ts` que
 * consumía se borraron en la migración 0125: eran código muerto que además ya
 * divergía del modelo real. El cálculo vive íntegro en `advance_order`
 * (Postgres) y lo cubren los tests de integración de `apps/api`, que ejercitan
 * el código que de verdad corre. Ver PARTE C.5 del spec de fase 2.
 */

/** Recoger: el motorizado declara la banda (determina la comisión al entregar). */
export function applyPickedUp(
  order: { status: OrderStatus },
  band: DistanceBand,
): { status: OrderStatus; band: DistanceBand } {
  assertTransition(order.status, 'picked_up')
  return { status: 'picked_up', band }
}
