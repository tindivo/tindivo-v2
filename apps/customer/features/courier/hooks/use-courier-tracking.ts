'use client'

import { ApiError } from '@tindivo/api-client'
import type { CourierStatus } from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
import { useCallback, useEffect, useState } from 'react'
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
}

/**
 * Seguimiento de una entrega — mismo patrón que `features/tracking/hooks/use-tracking.ts`:
 * polling de 8s (pausado con la pestaña oculta) + Realtime vía `canalUnico`
 * para el dueño autenticado, con el polling como fallback para el enlace
 * compartido sin sesión.
 *
 * `enabled` (default true) apaga sondeo y Realtime sin desmontar el hook:
 * `TrackingSheet` vive siempre montada en `CourierHost` (no hay página propia
 * que se desmonte al cerrar la hoja), así que sin este freno el navegador
 * seguiría pidiendo `/public/courier/:shortId` cada 8s para siempre después
 * de la primera vez que alguien mira su seguimiento.
 */
export function useCourierTracking(shortId: string, enabled = true) {
  const [data, setData] = useState<CourierTracking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ownedId, setOwnedId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<CourierTracking>(`/public/courier/${shortId}`)
      setData(res)
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar')
    }
  }, [shortId])

  useEffect(() => {
    if (!enabled) return
    let active = true
    load()
    const id = setInterval(() => {
      if (!active || document.visibilityState !== 'visible') return
      load()
    }, 8000)
    getSupabaseBrowser()
      .from('courier_orders')
      .select('id')
      .eq('short_id', shortId)
      .maybeSingle()
      .then(({ data: own }) => {
        if (!active || !own) return
        setOwnedId(own.id)
      })
    return () => {
      active = false
      clearInterval(id)
    }
  }, [shortId, load, enabled])

  useEffect(() => {
    if (!enabled) return
    const alVolver = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [load, enabled])

  useEffect(() => {
    if (!enabled || !ownedId) return
    const supabase = getSupabaseBrowser()
    const channel = supabase
      .channel(canalUnico(`courier-order-${ownedId}`))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'courier_orders', filter: `id=eq.${ownedId}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [ownedId, load])

  const cancel = useCallback(async () => {
    if (!ownedId) return
    setCancelling(true)
    try {
      await api.post(`/customer/courier-orders/${ownedId}/cancel`, {})
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cancelar')
    } finally {
      setCancelling(false)
    }
  }, [ownedId, load])

  return { data, error, ownedId, load, cancelling, cancel }
}
