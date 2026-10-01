'use client'

import type { DriverCourierOrderView } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Las entregas que entregué esta jornada, para el historial. Se pide al abrir
 * la pantalla y al volver a ella: el historial no cambia mientras se mira.
 */
export function useCourierHistory() {
  const [delivered, setDelivered] = useState<DriverCourierOrderView[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .get<{ data: { delivered: DriverCourierOrderView[] } }>('/driver/courier-orders/history')
        .then((r) => alive && setDelivered(r.data.delivered))
        .catch(() => {})
        .finally(() => alive && setLoading(false))
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return { delivered, loading }
}
