'use client'

/**
 * Cola offline "lite" (sin service worker sync): las transiciones que fallan
 * por RED se encolan en localStorage y se reintentan en orden al volver la
 * conexión. El estado optimista por pedido permite que la UI avance.
 */

export interface QueuedTransition {
  /** Idempotency-Key: el reintento reusa la misma para no duplicar. */
  key: string
  orderId: string
  action: string
  params: Record<string, unknown>
  ts: number
}

const OUTBOX_KEY = 'tindivo.drv.outbox.v1'
const OPTIMISTIC_KEY = 'tindivo.drv.optimistic.v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage lleno o bloqueado: la cola degrada a memoria de la sesión.
  }
}

export function enqueue(item: QueuedTransition) {
  const list = read<QueuedTransition[]>(OUTBOX_KEY, [])
  list.push(item)
  write(OUTBOX_KEY, list)
}

export function peekAll(): QueuedTransition[] {
  return read<QueuedTransition[]>(OUTBOX_KEY, [])
}

export function remove(key: string) {
  write(
    OUTBOX_KEY,
    peekAll().filter((i) => i.key !== key),
  )
}

export function queueSize(): number {
  return peekAll().length
}

export function setOptimistic(orderId: string, status: string) {
  const map = read<Record<string, string>>(OPTIMISTIC_KEY, {})
  map[orderId] = status
  write(OPTIMISTIC_KEY, map)
}

export function clearOptimistic(orderId: string) {
  const map = read<Record<string, string>>(OPTIMISTIC_KEY, {})
  delete map[orderId]
  write(OPTIMISTIC_KEY, map)
}

export function getOptimistic(): Record<string, string> {
  return read<Record<string, string>>(OPTIMISTIC_KEY, {})
}
