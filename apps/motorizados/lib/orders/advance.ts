'use client'

import { holdOrderPatch, releaseOrderPatch } from '@/hooks/use-driver-orders'
import { invalidateOrderDetail } from '@/lib/orders/detail-cache'
import { postTransition } from '@/lib/transitions'
import type { BoardOrder } from '@/lib/types'

/**
 * Avanza un pedido MÍO desde el gesto: primero se pinta, después se pregunta.
 *
 *   1. `holdOrderPatch` cambia la tarjeta YA (síncrono, antes de cualquier await).
 *   2. `postTransition` habla con el servidor. Los parámetros pueden ser una
 *      promesa —la llegada a la puerta espera un fix de GPS— y esa espera ocurre
 *      con la tarjeta ya cambiada, no delante del dedo.
 *   3. Con el POST bueno se pide la verdad y se suelta el parche; con un fallo se
 *      suelta sin esperar (la tarjeta vuelve al paso anterior) y se relanza para
 *      que el gesto lo diga.
 *
 * Solo para acciones del DUEÑO del pedido (`arrived`, `pickup`,
 * `arrived_customer`): no compiten con nadie, por eso pintar antes es honesto.
 * `take` compite y NO pasa por aquí. `deliver` es dinero y `delivered` es
 * terminal (invariante 8): tampoco.
 */
export async function advanceOrder(
  orderId: string,
  action: 'arrived' | 'pickup' | 'arrived_customer',
  patch: Partial<BoardOrder>,
  params: Record<string, unknown> | (() => Promise<Record<string, unknown>>) = {},
): Promise<void> {
  holdOrderPatch(orderId, patch)
  try {
    const resolved = typeof params === 'function' ? await params() : params
    const result = await postTransition(orderId, action, resolved)
    invalidateOrderDetail(orderId)
    await releaseOrderPatch(orderId, result === 'ok')
  } catch (err) {
    await releaseOrderPatch(orderId, false)
    throw err
  }
}
