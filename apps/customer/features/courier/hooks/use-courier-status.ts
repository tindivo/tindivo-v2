'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface CourierServiceStatus {
  enabled: boolean
  openNow: boolean
  hours: { start: string; end: string } | null
  price: number
  pausedMessage: string | null
}

const FALLBACK: CourierServiceStatus = {
  enabled: false,
  openNow: false,
  hours: { start: '18:00', end: '23:00' },
  price: 3,
  pausedMessage: null,
}

/** Estado de Tindivo Entregas sin sesión — para pintar el precio/horario antes de iniciar sesión. */
export function useCourierStatus() {
  const [status, setStatus] = useState<CourierServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    api
      .get<CourierServiceStatus>('/public/courier/status')
      .then((res) => {
        if (on) setStatus(res)
      })
      .catch(() => {
        if (on) setStatus(FALLBACK)
      })
      .finally(() => {
        if (on) setLoading(false)
      })
    return () => {
      on = false
    }
  }, [])

  return { status: status ?? FALLBACK, loading }
}
