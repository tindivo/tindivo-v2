'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { canalUnico } from '@tindivo/supabase'
import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** En qué punto del camino está el efectivo de un pedido. */
export type CashState = 'pending' | 'delivering' | 'disputed'

/** Un pedido de la pantalla de efectivo. La unidad de entrega desde 0157. */
export interface CashOrder {
  orderId: string
  shortId: string
  /** Puede faltar: la pantalla cae al `#shortId`. */
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  /** Solo cuando hubo adelanto de vuelto, para poder explicar el importe. */
  breakdown?: { collected: number; advance: number }
  state: CashState
  /** Null mientras no lo haya entregado. */
  settlementId: string | null
}

export interface CashBusinessGroup {
  businessId: string
  businessName: string
  accentColor?: string | null
  pendingTotal: number
  pendingCount: number
  deliveringTotal: number
  deliveringCount: number
  orders: CashOrder[]
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE COMPARTIDO. Dos consumidores, una petición.
//
// `DriverShell` lo usa para el badge de efectivo de la barra inferior, y
// `EfectivoList` para la pantalla. En `/efectivo` estaban montados los dos, así
// que eran DOS `GET /driver/cash-settlements` y DOS canales sobre
// `cash_settlements` — y por tanto DOS recargas por cada confirmación de la
// cajera, justo en el momento en que ella y el motorizado están mirando la misma
// pantalla.
// ─────────────────────────────────────────────────────────────────────────────

interface CashSnapshot {
  businesses: CashBusinessGroup[]
  loading: boolean
  error: string | null
}

const EMPTY: CashSnapshot = { businesses: [], loading: true, error: null }

let snapshot: CashSnapshot = EMPTY
const listeners = new Set<() => void>()
let refCount = 0
let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null = null

function emit(next: CashSnapshot): void {
  snapshot = next
  for (const l of listeners) l()
}

function load(): void {
  api
    .get<ApiEnvelope<{ businesses: CashBusinessGroup[] }>>('/driver/cash-settlements')
    .then((r) => emit({ businesses: r.data.businesses, loading: false, error: null }))
    .catch((e) =>
      emit({
        ...snapshot,
        loading: false,
        error: e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error',
      }),
    )
}

/**
 * La confirmación de la cajera llega sola.
 *
 * Antes esta pantalla solo se recargaba al montarse: el motorizado entregaba,
 * la cajera confirmaba delante de él, y su teléfono seguía diciendo
 * "Entregando…" hasta que saliera y volviera a entrar. Con la entrega pedido a
 * pedido eso se nota mucho más —son varias líneas esperando a la vez— y es
 * justo el momento en que los dos están mirando la pantalla.
 *
 * Sin filtro por `driver_id`: la policy `cs_driver_read` ya acota lo que este
 * usuario puede ver, y el canal solo dispara una recarga.
 */
function start(): void {
  const supabase = getSupabaseBrowser()
  // Nombre único POR SUSCRIPCIÓN, no fijo: con `'drv-cash'` a secas, un
  // remontaje dentro de la ventana asíncrona de `removeChannel` recibía el
  // canal anterior todavía conectado y el `.on()` lanzaba
  // «cannot add postgres_changes callbacks ... after subscribe()».
  channel = supabase
    .channel(canalUnico('drv-cash'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
      load(),
    )
    .subscribe()
  load()
}

function stop(): void {
  if (channel !== null) {
    void getSupabaseBrowser().removeChannel(channel)
    channel = null
  }
  // El snapshot se conserva: al volver a montar se ve el último dato bueno en
  // vez de un parpadeo a vacío.
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  refCount += 1
  if (refCount === 1) start()
  return () => {
    listeners.delete(onChange)
    refCount -= 1
    if (refCount === 0) stop()
  }
}

/** Efectivo pendiente del motorizado. Llamarlo N veces NO multiplica peticiones. */
export function useCashSummary() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )
  return { ...state, reload: load }
}
