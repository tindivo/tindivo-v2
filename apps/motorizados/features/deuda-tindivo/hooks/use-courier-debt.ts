'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import type { CourierDebtItem, DriverCourierDebt } from '@tindivo/contracts'
import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'

/**
 * Lo que el motorizado le debe a Tindivo por Entregas (0237).
 *
 * STORE COMPARTIDO, igual que `useCashSummary`: lo leen el badge de «Deuda» en
 * la barra inferior y la pantalla, y montados a la vez no deben duplicar la
 * petición.
 *
 * POR POLL Y NO POR REALTIME: la RLS de `courier_orders` no deja al
 * motorizado leer la tabla desde el navegador (0232), así que no hay canal que
 * escuchar. Cada 15 s con la pestaña visible basta para ver llegar el
 * «Confirmar» de Jesús.
 */

const POLL_MS = 15_000

interface DebtSnapshot {
  items: CourierDebtItem[]
  loading: boolean
  error: string | null
}

const EMPTY: DebtSnapshot = { items: [], loading: true, error: null }

let snapshot: DebtSnapshot = EMPTY
const listeners = new Set<() => void>()
let refCount = 0
let timer: ReturnType<typeof setInterval> | null = null

function emit(next: DebtSnapshot): void {
  snapshot = next
  for (const l of listeners) l()
}

function load(): Promise<void> {
  return api
    .get<ApiEnvelope<DriverCourierDebt>>('/driver/courier-debt')
    .then((r) => emit({ items: r.data.items, loading: false, error: null }))
    .catch((e) =>
      emit({
        ...snapshot,
        loading: false,
        error: e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error',
      }),
    )
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void load()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  refCount += 1
  if (refCount === 1) {
    void load()
    timer = setInterval(onVisible, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(onChange)
    refCount -= 1
    if (refCount === 0) {
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

export function useCourierDebt() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )
  return { ...state, reload: load }
}

/** «Entregar» una entrega. Lanza con el mensaje del servidor si falla. */
export async function remitCourierFee(courierOrderId: string): Promise<void> {
  try {
    await api.post('/driver/courier-debt', { courierOrderId })
  } catch (e) {
    throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Sin conexión')
  }
}
