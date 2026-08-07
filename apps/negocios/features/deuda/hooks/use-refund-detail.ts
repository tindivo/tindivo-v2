'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { errMsg } from '../lib/format'
import type { RefundDetail } from '../types'

export function useRefundDetail(id: string) {
  const [data, setData] = useState<RefundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: RefundDetail }>(`/business/account/refunds/${id}`)
      setData(res.data)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
