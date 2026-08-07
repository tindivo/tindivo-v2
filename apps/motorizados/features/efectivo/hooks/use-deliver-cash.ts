'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

export function useDeliverCash() {
  const [busy, setBusy] = useState(false)

  const deliver = useCallback(
    async (businessId: string, deliveredAmount: number): Promise<void> => {
      setBusy(true)
      try {
        await api.post('/driver/cash-settlements', { businessId, deliveredAmount })
      } catch (e) {
        throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { deliver, busy }
}
