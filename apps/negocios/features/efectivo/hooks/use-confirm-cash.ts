'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

export function useConfirmCash() {
  const [busy, setBusy] = useState(false)

  /** Sin monto: lo deriva la RPC de la propia liquidación (0157). Si la cajera
   *  contó algo distinto, el camino es la disputa, no confirmar otra cifra. */
  const confirm = useCallback(async (settlementId: string): Promise<void> => {
    setBusy(true)
    try {
      await api.post(`/business/cash-settlements/${settlementId}/confirm`, {})
    } catch (e) {
      throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }, [])

  return { confirm, busy }
}
