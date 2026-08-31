'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { ORDER_SELECT } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { HistRow } from '../types'

export function useHistory(startDate: string, endDate: string) {
  const { bizId } = useDashboard()
  const [rows, setRows] = useState<HistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!bizId) return
    setLoading(true)
    setError(null)

    // Formatear timestamp exacto en hora local de Lima (UTC-5)
    const startIso = `${startDate}T00:00:00-05:00`
    const endIso = `${endDate}T23:59:59-05:00`

    try {
      const { data, error: e } = await getSupabaseBrowser()
        .from('orders')
        .select(ORDER_SELECT)
        .eq('business_id', bizId)
        .in('status', ['delivered', 'cancelled'])
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (e) {
        setError(e.message)
      } else {
        setRows((data ?? []) as unknown as HistRow[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [bizId, startDate, endDate])

  useEffect(() => {
    load()
  }, [load])

  return { rows, loading, error, reload: load }
}
