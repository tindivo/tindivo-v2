'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

/** Un pedido dentro de la rendición. Lo que permite rendir comprobando. */
export interface SettlementOrder {
  orderId: string
  shortId: string
  /** Puede faltar: la pantalla cae al `#shortId`. */
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  /** Solo cuando hubo adelanto de vuelto, para poder explicar el importe. */
  breakdown?: { collected: number; advance: number }
}

export interface TodayRow {
  businessId: string
  businessName: string
  expected: number
  orderCount: number
  kind: 'pending' | 'awaiting'
  settlementId: string | null
  status: string | null
  deliveredAmount: number | null
  orders: SettlementOrder[]
}

export function useCashSummary() {
  const [today, setToday] = useState<TodayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<ApiEnvelope<{ today: TodayRow[] }>>('/driver/cash-settlements')
      .then((r) => {
        setToday(r.data.today)
        setError(null)
      })
      .catch((e) => {
        setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { today, loading, error, reload: load }
}
