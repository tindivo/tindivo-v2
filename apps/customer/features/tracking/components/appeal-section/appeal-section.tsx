'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AppealCreateView } from './appeal-create-view'
import { AppealProgressView } from './appeal-progress-view'
import type { AppealSectionProps, AppealStatus } from './types'

export function AppealSection({
  orderId,
  shortId,
  hasAppeal,
  total,
  onAppealCreated,
}: AppealSectionProps) {
  const [appealData, setAppealData] = useState<AppealStatus | null>(null)
  const [loadingAppeal, setLoadingAppeal] = useState(false)
  const [appealing, setAppealing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAppealStatus = useCallback(async () => {
    if (!orderId || !hasAppeal) return
    setLoadingAppeal(true)
    try {
      const res = await api.get<{ data: AppealStatus }>(`/customer/orders/${orderId}/appeal`)
      setAppealData(res.data)
    } catch {
      // Si no encuentra la apelación, no pasa nada
    } finally {
      setLoadingAppeal(false)
    }
  }, [orderId, hasAppeal])

  useEffect(() => {
    loadAppealStatus()
  }, [loadAppealStatus])

  async function doAppeal() {
    if (!orderId) return
    setAppealing(true)
    setError(null)
    try {
      await api.post(`/customer/orders/${orderId}/appeal`, {})
      onAppealCreated()
      await loadAppealStatus()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.problem.detail ?? e.message)
      } else {
        setError('Error al enviar la apelación')
      }
    } finally {
      setAppealing(false)
    }
  }

  if (!hasAppeal) {
    return (
      <AppealCreateView
        shortId={shortId}
        orderId={orderId}
        appealing={appealing}
        error={error}
        onAppeal={doAppeal}
      />
    )
  }

  return (
    <AppealProgressView
      shortId={shortId}
      loading={loadingAppeal}
      appealData={appealData}
      total={total}
    />
  )
}
