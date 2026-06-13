'use client'

import { ApiError } from '@tindivo/api-client'
import { api } from './api'
import { clearOptimistic, enqueue, peekAll, remove, setOptimistic } from './offline-queue'

/** Estado destino optimista por acción (para pintar la UI sin red). */
const NEXT_STATUS: Record<string, string> = {
  take: 'heading_to_restaurant',
  arrived: 'waiting_at_restaurant',
  pickup: 'picked_up',
  deliver: 'delivered',
  no_show: 'cancelled',
}

/**
 * Postea una transición. Si falla por RED (no por validación del servidor),
 * la encola con su Idempotency-Key y devuelve 'queued' — la UI avanza optimista.
 * Los ApiError (4xx/5xx) se relanzan: son errores reales del dominio.
 */
export async function postTransition(
  orderId: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<'ok' | 'queued'> {
  const key = crypto.randomUUID()
  try {
    await api.post(`/driver/orders/${orderId}/transition`, { action, ...params }, key)
    clearOptimistic(orderId)
    return 'ok'
  } catch (err) {
    if (err instanceof ApiError) throw err
    enqueue({ key, orderId, action, params, ts: Date.now() })
    const next = NEXT_STATUS[action]
    if (next) setOptimistic(orderId, next)
    return 'queued'
  }
}

let flushing = false

/**
 * Reintenta la cola en orden FIFO. Un 4xx/5xx descarta el item (ya aplicado o
 * inválido); otro fallo de red detiene el flush hasta el próximo 'online'.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const item of peekAll()) {
      try {
        await api.post(
          `/driver/orders/${item.orderId}/transition`,
          { action: item.action, ...item.params },
          item.key,
        )
        remove(item.key)
        clearOptimistic(item.orderId)
      } catch (err) {
        if (err instanceof ApiError) {
          // El servidor lo rechazó (o ya se aplicó en un intento previo): descartar.
          remove(item.key)
          clearOptimistic(item.orderId)
          continue
        }
        break // sigue sin red: reintentar en el próximo evento online
      }
    }
  } finally {
    flushing = false
  }
}
