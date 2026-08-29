'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { CashLine, NocheCerrada } from './use-cash-settlements'

interface SettlementRow {
  id: string
  settlement_date: string
  delivered_at_ts: string | null
  delivered_amount: number | null
  reported_amount: number | null
  status: string
  driver_id: string | null
  drivers: { full_name: string | null; phone: string | null } | null
}

interface OrderRow {
  id: string
  short_id: string
  customer_name: string | null
  delivered_at: string | null
  cash_owed_at_delivery: number | null
  change_advanced: number | null
  cash_settlement_id: string | null
  driver_id: string | null
  drivers: { full_name: string | null; phone: string | null } | null
}

const CERRADOS = ['confirmed', 'resolved', 'auto_assumed_confirmed'] as const

const recienteAntes = (a: CashLine, b: CashLine) =>
  (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')

export function useHistorialNoches(enabled: boolean) {
  const [noches, setNoches] = useState<NocheCerrada[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = getSupabaseBrowser()

    try {
      const { data: cerradosRaw, error: e1 } = await supabase
        .from('cash_settlements')
        .select(
          'id,settlement_date,delivered_at_ts,delivered_amount,reported_amount,status,driver_id,drivers(full_name,phone)',
        )
        .in('status', CERRADOS)
        .order('settlement_date', { ascending: false })
        .limit(80)

      if (e1) throw new Error(e1.message)

      const cerrados = (cerradosRaw ?? []) as unknown as SettlementRow[]
      const settlements = new Map<string, SettlementRow>()
      for (const s of cerrados) settlements.set(s.id, s)

      const ids = [...settlements.keys()]
      let enlazados: OrderRow[] = []
      if (ids.length > 0) {
        const { data, error: e2 } = await supabase
          .from('orders')
          .select(
            'id,short_id,customer_name,delivered_at,cash_owed_at_delivery,change_advanced,cash_settlement_id,driver_id,drivers(full_name,phone)',
          )
          .in('cash_settlement_id', ids)

        if (e2) throw new Error(e2.message)
        enlazados = (data ?? []) as unknown as OrderRow[]
      }

      const nochesCerradas = new Map<string, NocheCerrada>()

      for (const o of enlazados) {
        const s = o.cash_settlement_id ? settlements.get(o.cash_settlement_id) : undefined
        if (!s?.driver_id) continue

        const key = `${s.driver_id}|${s.settlement_date}`
        const n = nochesCerradas.get(key) ?? {
          key,
          driverName: s.drivers?.full_name ?? o.drivers?.full_name ?? 'Motorizado',
          fecha: s.settlement_date,
          total: 0,
          count: 0,
          lines: [],
        }

        const resolvedName = s.drivers?.full_name || o.drivers?.full_name
        if (n.driverName === 'Motorizado' && resolvedName) {
          n.driverName = resolvedName
        }

        const line: CashLine = {
          orderId: o.id,
          shortId: o.short_id,
          customerName: o.customer_name,
          deliveredAt: o.delivered_at,
          cashOwed: Number(o.cash_owed_at_delivery ?? 0),
          advance: Number(o.change_advanced ?? 0),
          state: 'confirmed',
          settlementId: s.id,
          settlementDate: s.settlement_date,
          reportedAmount: null,
        }

        n.total += line.cashOwed
        n.count += 1
        n.lines.push(line)
        nochesCerradas.set(key, n)
      }

      for (const n of nochesCerradas.values()) {
        n.lines.sort(recienteAntes)
      }

      setNoches([...nochesCerradas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)))
      setHasLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled && !hasLoaded) {
      load()
    }
  }, [enabled, hasLoaded, load])

  return { noches, loading, error, reload: load }
}
