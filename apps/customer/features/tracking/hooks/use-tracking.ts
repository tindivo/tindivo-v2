'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import type { CancelState, Tracking } from '@/features/tracking/types'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface UseTrackingResult {
  data: Tracking | null
  error: string | null
  ownedId: string | null
  load: () => Promise<void>
  cancel: CancelState
}

export function useTracking(shortId: string): UseTrackingResult {
  const [data, setData] = useState<Tracking | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Propiedad: si hay sesión y el pedido es del usuario, RLS devuelve la fila (id) → habilita cancelar.
  const [ownedId, setOwnedId] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<Tracking>(`/public/orders/${shortId}`)
      setData(res)
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar')
    }
  }, [shortId])

  useEffect(() => {
    let active = true
    load()
    const id = setInterval(() => {
      if (active) load()
    }, 8000)
    // Comprobación de propiedad (una vez): solo el dueño autenticado ve "Cancelar".
    getSupabaseBrowser()
      .from('orders')
      .select('id')
      .eq('short_id', shortId)
      .maybeSingle()
      .then(({ data: own }) => {
        if (active && own) setOwnedId(own.id)
      })
    return () => {
      active = false
      clearInterval(id)
    }
  }, [shortId, load])

  // Realtime: el dueño autenticado recibe los cambios al instante (el polling de 8s
  // queda como fallback para enlaces compartidos / pérdida de conexión).
  useEffect(() => {
    if (!ownedId) return
    const supabase = getSupabaseBrowser()
    const channel = supabase
      .channel(`order-${ownedId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${ownedId}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [ownedId, load])

  const doCancel = useCallback(async () => {
    if (!ownedId) return
    setCancelling(true)
    try {
      await api.post(`/customer/orders/${ownedId}/cancel`, {})
      setConfirmCancel(false)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cancelar')
      setConfirmCancel(false)
    } finally {
      setCancelling(false)
    }
  }, [ownedId, load])

  return {
    data,
    error,
    ownedId,
    load,
    cancel: {
      confirmCancel,
      setConfirmCancel,
      cancelling,
      doCancel,
    },
  }
}
