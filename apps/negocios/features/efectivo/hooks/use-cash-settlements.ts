'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface CashRow {
  id: string
  settlement_date: string
  /** Hora de la entrega. Desde 0111 puede haber varias el mismo día: la fecha
   *  sola ya no distingue una liquidación de otra. */
  delivered_at_ts: string | null
  total_cash: number
  order_count: number | null
  delivered_amount: number | null
  confirmed_amount: number | null
  reported_amount: number | null
  status: string
  driver_id: string | null
  drivers: { full_name: string | null } | null
}

/** Efectivo que el motorizado ya cobró al cliente pero todavía no ha rendido. */
interface PendingCashRow {
  driver_id: string
  order_amount: number
  delivery_fee: number
  drivers: { full_name: string | null; phone: string | null } | null
}

export interface PendingByDriver {
  driverId: string
  name: string
  phone: string | null
  total: number
  orders: number
}

export function useCashSettlements() {
  const [rows, setRows] = useState<CashRow[]>([])
  const [pendingCash, setPendingCash] = useState<PendingByDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = getSupabaseBrowser()

    try {
      const { data, error: e } = await supabase
        .from('cash_settlements')
        .select(
          'id,settlement_date,delivered_at_ts,total_cash,order_count,delivered_amount,confirmed_amount,reported_amount,status,driver_id,drivers(full_name)',
        )
        .order('created_at', { ascending: false })
        .limit(50)
      if (e) {
        setError(e.message)
        return
      }
      setRows((data ?? []) as CashRow[])

      // Efectivo cobrado y NO rendido. `cash_settlement_id is null` es lo que lo
      // define, posible desde 0111: antes no había forma de distinguir un pedido
      // ya liquidado de uno pendiente.
      const { data: pend } = await supabase
        .from('orders')
        .select('driver_id,order_amount,delivery_fee,drivers(full_name,phone)')
        .eq('status', 'delivered')
        .eq('payment_real', 'paid_cash')
        .is('cash_settlement_id', null)
        .not('driver_id', 'is', null)

      const porMotorizado = new Map<string, PendingByDriver>()
      for (const o of (pend ?? []) as unknown as PendingCashRow[]) {
        if (!o.driver_id) continue
        const acc = porMotorizado.get(o.driver_id) ?? {
          driverId: o.driver_id,
          name: o.drivers?.full_name ?? 'Motorizado',
          phone: o.drivers?.phone ?? null,
          total: 0,
          orders: 0,
        }
        acc.total += Number(o.order_amount ?? 0) + Number(o.delivery_fee ?? 0)
        acc.orders += 1
        porMotorizado.set(o.driver_id, acc)
      }
      setPendingCash([...porMotorizado.values()].sort((a, b) => b.total - a.total))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const channel = getSupabaseBrowser()
      .channel('biz-cash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        load(),
      )
      // "Pendiente del motorizado" se calcula sobre `orders`, así que también
      // tiene que refrescar cuando un pedido se entrega o se enlaza a un ciclo.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => {
      getSupabaseBrowser().removeChannel(channel)
    }
  }, [load])

  return { rows, pendingCash, loading, error, reload: load }
}
