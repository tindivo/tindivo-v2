'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

export function useConfirmCash() {
  const [busy, setBusy] = useState(false)

  const confirm = useCallback(
    async (settlementId: string, confirmedAmount: number): Promise<void> => {
      setBusy(true)
      try {
        await api.post(`/business/cash-settlements/${settlementId}/confirm`, {
          confirmedAmount,
        })
      } catch (e) {
        throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { confirm, busy }
}
