'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import type { PerformancePayload } from '@tindivo/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type PerformanceData = PerformancePayload & { businessName: string }

export function usePerformance(start: string, end: string) {
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start, end })
      const res = await api.get<ApiEnvelope<PerformanceData>>(
        `/business/reports/rendimiento?${params.toString()}`,
      )
      setData(res.data)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudieron cargar las métricas',
      )
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
