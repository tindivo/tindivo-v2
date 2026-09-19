'use client'

import { api } from '@/lib/api'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Detalle del pedido a demanda, con lo que ya está en camino compartido.
 *
 * EXISTE PARA QUE LAS HOJAS DE «MÍOS» SALGAN AL INSTANTE. El cobro y el motivo
 * de soltar necesitan el detalle completo (importes, QR, coordenadas) y la
 * bandeja solo tiene la fila del board. Pedirlo al soltar el dedo pone
 * 0,5-0,75 s de espera delante de la hoja; pedirlo en cuanto EMPIEZA el
 * arrastre la esconde detrás del gesto, que ya dura eso.
 *
 * Una petición en vuelo se comparte y una reciente (15 s) se reutiliza. Más
 * vieja no: el detalle lleva estado que cambia (llegada a la puerta, cobro) y un
 * cobro sobre datos rancios es justo lo que no se puede permitir.
 */
const TTL_MS = 15_000

const cache = new Map<string, { at: number; promise: Promise<OrderDetailResponse> }>()

export function fetchOrderDetail(orderId: string, opts: { fresh?: boolean } = {}) {
  const hit = cache.get(orderId)
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.promise

  const promise = api
    .get<{ data: OrderDetailResponse }>(`/driver/orders/${orderId}`)
    .then((res) => res.data)
  cache.set(orderId, { at: Date.now(), promise })
  // Un fallo no se cachea: el siguiente intento vuelve a preguntar.
  promise.catch(() => {
    if (cache.get(orderId)?.promise === promise) cache.delete(orderId)
  })
  return promise
}

/** Tras cualquier transición el detalle guardado ya no es la verdad. */
export function invalidateOrderDetail(orderId: string): void {
  cache.delete(orderId)
}
