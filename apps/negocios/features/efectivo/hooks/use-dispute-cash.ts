'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

export function useDisputeCash() {
  const [busy, setBusy] = useState(false)

  const dispute = useCallback(
    async (settlementId: string, reportedAmount: number, note: string): Promise<void> => {
      setBusy(true)
      try {
        await api.post(`/business/cash-settlements/${settlementId}/dispute`, {
          reportedAmount,
          note: note.trim(),
        })
      } catch (e) {
        throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { dispute, busy }
}
