'use client'

import { ApiError } from '@tindivo/api-client'
import type { CourierStatus } from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface CourierTracking {
  shortId: string
  orderNumber: number
  status: CourierStatus
  originName: string
  destinationName: string
  originCoordinates: { lat: number; lng: number }
  destinationCoordinates: { lat: number; lng: number }
  itemDescription: string
  feeAmount: number
  payer: 'origin' | 'destination'
  readyAt: string
  driverName: string | null
  createdAt: string
  acceptedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  /** Minutos que espera una solicitud antes de cancelarse sola (`timers.courierAcceptMinutes`). */
  acceptMinutes: number
  /**
   * Cuándo se cancela sola si nadie la acepta; `null` una vez aceptada (0236).
   * Es el MISMO plazo que ve el motorizado en su tarjeta.
   */
  acceptDeadline: string | null
}

const POLL_MS = 8000

interface Snapshot {
  data: CourierTracking | null
  error: string | null
  /** `courier_orders.id` si la sesión es la dueña (RLS); null en el enlace compartido. */
  ownedId: string | null
}

const EMPTY: Snapshot = { data: null, error: null, ownedId: null }

/**
 * Una sola fuente por entrega, compartida por todos los que la miran.
 *
 * La hoja de seguimiento y el mapa (`CourierMapHost`) pintan la misma entrega
 * a la vez. Con un hook independiente cada uno, eran dos sondeos cada 8 s, dos
 * consultas de propiedad y dos canales Realtime por la misma fila — el doble
 * de datos móviles en un pueblo con mala señal. Ahora el primero que la mira
 * arranca la fuente y el último que se va la apaga; lo ya cargado se queda en
 * memoria para que reabrir la hoja pinte al instante.
 */
class TrackingFeed {
  snap: Snapshot = EMPTY
  private listeners = new Set<() => void>()
  private users = 0
  private stop: (() => void) | null = null

  constructor(private readonly shortId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch }
    for (const l of this.listeners) l()
  }

  load = async () => {
    try {
      const data = await api.get<CourierTracking>(`/public/courier/${this.shortId}`)
      this.set({ data, error: null })
    } catch (e) {
      this.set({
        error: e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar',
      })
    }
  }

  /** Cuenta un consumidor más; devuelve cómo soltarlo. */
  acquire = () => {
    this.users++
    if (this.users === 1) this.stop = this.start()
    return () => {
      this.users--
      if (this.users === 0) {
        this.stop?.()
        this.stop = null
      }
    }
  }

  private start(): () => void {
    let active = true
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null = null
    const supabase = getSupabaseBrowser()

    void this.load()
    // Entregada o cancelada ya no cambia (`delivered` es terminal): seguir
    // preguntando cada 8 s solo gastaría datos.
    const vivo = () => {
      const st = this.snap.data?.status
      return st !== 'delivered' && st !== 'cancelled'
    }
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && vivo()) void this.load()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && vivo()) void this.load()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Realtime solo para el dueño: la policy de `courier_orders` no deja ver
    // la fila a nadie más, así que el enlace compartido vive del sondeo.
    supabase
      .from('courier_orders')
      .select('id')
      .eq('short_id', this.shortId)
      .maybeSingle()
      .then(({ data: own }) => {
        if (!active || !own) return
        this.set({ ownedId: own.id })
        channel = supabase
          .channel(canalUnico(`courier-order-${own.id}`))
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'courier_orders',
              filter: `id=eq.${own.id}`,
            },
            () => void this.load(),
          )
          .subscribe()
      })

    return () => {
      active = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) void supabase.removeChannel(channel)
    }
  }
}

const feeds = new Map<string, TrackingFeed>()

function feedFor(shortId: string): TrackingFeed | null {
  if (!shortId) return null
  let feed = feeds.get(shortId)
  if (!feed) {
    feed = new TrackingFeed(shortId)
    feeds.set(shortId, feed)
  }
  return feed
}

const noopSubscribe = () => () => {}

/**
 * Seguimiento de una entrega — mismo patrón que `features/tracking/hooks/use-tracking.ts`:
 * polling de 8s (pausado con la pestaña oculta) + Realtime vía `canalUnico`
 * para el dueño autenticado, con el polling como fallback para el enlace
 * compartido sin sesión.
 *
 * `enabled` (default true) suelta la fuente sin desmontar el hook:
 * `TrackingSheet` vive siempre montada en `CourierHost` (no hay página propia
 * que se desmonte al cerrar la hoja), así que sin este freno el navegador
 * seguiría pidiendo `/public/courier/:shortId` cada 8s para siempre después
 * de la primera vez que alguien mira su seguimiento.
 */
export function useCourierTracking(shortId: string, enabled = true) {
  const feed = feedFor(shortId)
  const { data, error, ownedId } = useSyncExternalStore(
    feed?.subscribe ?? noopSubscribe,
    () => feed?.snap ?? EMPTY,
    () => EMPTY,
  )
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !feed) return
    return feed.acquire()
  }, [feed, enabled])

  // Otra entrega: un error de cancelar la anterior no se arrastra.
  useEffect(() => {
    setCancelError(null)
  }, [shortId])

  const load = useCallback(async () => {
    await feed?.load()
  }, [feed])

  const cancel = useCallback(async (): Promise<boolean> => {
    if (!feed || !ownedId) return false
    setCancelling(true)
    setCancelError(null)
    try {
      await api.post(`/customer/courier-orders/${ownedId}/cancel`, {})
      await feed.load()
      return true
    } catch (e) {
      setCancelError(
        e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cancelar',
      )
      // Lo más probable es que un motorizado la haya tomado justo antes: el
      // estado nuevo explica por qué ya no se puede cancelar.
      await feed.load()
      return false
    } finally {
      setCancelling(false)
    }
  }, [feed, ownedId])

  return { data, error, ownedId, load, cancelling, cancel, cancelError }
}
