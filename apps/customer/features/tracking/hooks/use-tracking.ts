'use client'

import { ApiError } from '@tindivo/api-client'
import { canalUnico } from '@tindivo/supabase'
import { useCallback, useEffect, useState } from 'react'
import type { CancelState, Tracking } from '@/features/tracking/types'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface UseTrackingResult {
  data: Tracking | null
  error: string | null
  ownedId: string | null
  /**
   * La nota que el cliente le escribió al motorizado, si escribió alguna.
   *
   * NO VIENE DE `get_tracking`, y no es un descuido. Ese endpoint es público
   * —`anon` puede llamarlo, porque el enlace de seguimiento se comparte por
   * WhatsApp— y esta frase habla de la casa de alguien: «el portón azul»,
   * «el perro ladra pero no muerde». Por eso viaja por el mismo sitio que ya
   * decide si se puede cancelar: una lectura directa por PostgREST donde la RLS
   * de `orders` responde la fila solo a su dueño. Sin viaje extra: la consulta
   * de propiedad ya se hacía, solo pide una columna más.
   */
  ownNote: string | null
  load: () => Promise<void>
  cancel: CancelState
}

export function useTracking(shortId: string): UseTrackingResult {
  const [data, setData] = useState<Tracking | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Propiedad: si hay sesión y el pedido es del usuario, RLS devuelve la fila (id) → habilita cancelar.
  const [ownedId, setOwnedId] = useState<string | null>(null)
  const [ownNote, setOwnNote] = useState<string | null>(null)
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
      .select('id,customer_notes')
      .eq('short_id', shortId)
      .maybeSingle()
      .then(({ data: own }) => {
        if (!active || !own) return
        setOwnedId(own.id)
        setOwnNote(own.customer_notes)
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
    // Único por suscripción, no por pedido: volver a abrir el MISMO seguimiento
    // reusaba el topic mientras el canal anterior seguía dándose de baja, y el
    // `.on()` lanzaba. Ver `canalUnico` en `@tindivo/supabase`.
    const channel = supabase
      .channel(canalUnico(`order-${ownedId}`))
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
    ownNote,
    load,
    cancel: {
      confirmCancel,
      setConfirmCancel,
      cancelling,
      doCancel,
    },
  }
}
