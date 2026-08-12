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

/** Efectivo del negocio que el motorizado lleva encima y todavía no ha rendido. */
interface PendingCashRow {
  driver_id: string
  id: string
  short_id: string
  customer_name: string | null
  delivered_at: string | null
  cash_owed_at_delivery: number | null
  change_advanced: number | null
  drivers: { full_name: string | null; phone: string | null } | null
}

/** Un pedido del desglose. Mismo contenido que ve el motorizado. */
export interface PendingOrder {
  orderId: string
  shortId: string
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  advance: number
}

export interface PendingByDriver {
  driverId: string
  name: string
  phone: string | null
  total: number
  orders: number
  detail: PendingOrder[]
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
      //
      // LEE `cash_owed_at_delivery`, NO DEDUCE DEL MÉTODO.
      //
      // Esta consulta era la CUARTA copia de la regla del corte de caja, y la
      // única que quedaba viva después de 0141: filtraba `paid_cash` y sumaba
      // `order_amount + delivery_fee`. Con eso la cajera veía un número y el
      // motorizado otro, para el mismo dinero y en la misma noche:
      //
      //   · un cobro mixto no salía aquí, aunque el motorizado llevara su parte;
      //   · y desde 0146, el sencillo adelantado tampoco — la cajera veía S/ 45
      //     de un pedido por el que el motorizado rinde S/ 50, que son los 5 que
      //     ella misma le adelantó.
      //
      // `> 0` en vez de un filtro por método: lo que define si entra al corte es
      // llevar efectivo, no cómo se llame el cobro.
      const { data: pend } = await supabase
        .from('orders')
        .select(
          'driver_id,id,short_id,customer_name,delivered_at,cash_owed_at_delivery,change_advanced,drivers(full_name,phone)',
        )
        .eq('status', 'delivered')
        .gt('cash_owed_at_delivery', 0)
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
          detail: [],
        }
        acc.total += Number(o.cash_owed_at_delivery ?? 0)
        acc.orders += 1
        acc.detail.push({
          orderId: o.id,
          shortId: o.short_id,
          customerName: o.customer_name,
          deliveredAt: o.delivered_at,
          cashOwed: Number(o.cash_owed_at_delivery ?? 0),
          advance: Number(o.change_advanced ?? 0),
        })
        porMotorizado.set(o.driver_id, acc)
      }
      for (const d of porMotorizado.values()) {
        d.detail.sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''))
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
