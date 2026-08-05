'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { errMsg } from '../lib/format'
import type { AccountSummaryData, PendingGroupItem } from '../types'

export function useAccountSummary() {
  const [data, setData] = useState<AccountSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: AccountSummaryData }>('/business/account/summary')
      setData(res.data)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groupedUnits = useMemo<PendingGroupItem[]>(() => {
    if (!data?.pendingCharges) return []

    const map = new Map<string, PendingGroupItem>()

    for (const c of data.pendingCharges) {
      if (c.chargeType === 'refund_charge' || !c.orderId) {
        const key = `refund_${c.id}`
        map.set(key, {
          key,
          type: 'refund',
          orderId: c.orderId,
          shortId: c.shortId,
          createdAt: c.createdAt,
          charges: [c],
          totalAmount: c.amount,
        })
      } else {
        const key = `order_${c.orderId}`
        if (!map.has(key)) {
          map.set(key, {
            key,
            type: 'order',
            orderId: c.orderId,
            shortId: c.shortId,
            createdAt: c.createdAt,
            charges: [],
            totalAmount: 0,
          })
        }
        const grp = map.get(key)
        if (grp) {
          grp.charges.push(c)
          grp.totalAmount += c.amount
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [data?.pendingCharges])

  const balance = data?.balanceDue ?? 0

  return {
    data,
    loading,
    error,
    reload: load,
    groupedUnits,
    balance,
  }
}
