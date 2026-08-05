'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { HistRow } from '../types'

function todayLimaRange(): { start: string; end: string } {
  const now = new Date()
  const limaOffset = -5 * 60 // minutos
  const limaMs = now.getTime() + (now.getTimezoneOffset() + limaOffset) * 60 * 1000
  const lima = new Date(limaMs)
  const y = lima.getFullYear()
  const m = String(lima.getMonth() + 1).padStart(2, '0')
  const d = String(lima.getDate()).padStart(2, '0')
  return {
    start: `${y}-${m}-${d}T00:00:00-05:00`,
    end: `${y}-${m}-${d}T23:59:59-05:00`,
  }
}

export function useHistory() {
  const { bizId } = useDashboard()
  const [rows, setRows] = useState<HistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { start, end } = todayLimaRange()

    try {
      const { data, error: e } = await getSupabaseBrowser()
        .from('orders')
        .select(
          'id,short_id,status,source,customer_name,order_amount,delivery_fee,payment_intent,delivered_at,cancelled_at,cancel_note,created_at',
        )
        .eq('business_id', bizId)
        .in('status', ['delivered', 'cancelled'])
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(200)

      if (e) {
        setError(e.message)
      } else {
        setRows((data ?? []) as HistRow[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [bizId])

  useEffect(() => {
    load()
  }, [load])

  return { rows, loading, error, reload: load }
}
