'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isToday } from '@/lib/format'
import { getOptimistic } from '@/lib/offline-queue'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'

const BOARD_COLUMNS =
  'id,short_id,status,source,customer_name,customer_phone,delivery_address,delivery_reference,order_amount,delivery_fee,payment_intent,driver_id,created_at,estimated_ready_at,urgent_since,appears_in_queue_at,occupancy_slots,waiting_at_restaurant_at,delivered_at,client_pays_with,change_to_give,business_id,businesses(name)'

export interface DriverBoard {
  orders: BoardOrder[]
  myDriverId: string | null
  lastSyncOk: boolean
  refetch: () => Promise<void>
  available: BoardOrder[]
  upcoming: BoardOrder[]
  mine: BoardOrder[]
  deliveredToday: BoardOrder[]
  mySlots: number
  hasOverdueAvailable: boolean
}

/** Board del motorizado: supabase directo (RLS) + realtime + derivados. */
export function useDriverOrders(now: number): DriverBoard {
  const [orders, setOrders] = useState<BoardOrder[]>([])
  const [myDriverId, setMyDriverId] = useState<string | null>(null)
  const [lastSyncOk, setLastSyncOk] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data, error } = await supabase
      .from('orders')
      .select(BOARD_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      setLastSyncOk(false)
      return
    }
    setLastSyncOk(true)
    setOrders(
      (data ?? []).map((o) => ({
        ...o,
        order_amount: Number(o.order_amount),
        delivery_fee: Number(o.delivery_fee),
        client_pays_with: o.client_pays_with == null ? null : Number(o.client_pays_with),
        change_to_give: o.change_to_give == null ? null : Number(o.change_to_give),
      })) as BoardOrder[],
    )
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('drivers')
      .select('id')
      .maybeSingle()
      .then(({ data }) => setMyDriverId(data?.id ?? null))
    void refetch()
    const channel = supabase
      .channel('drv-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void refetch()
      })
      .subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch])

  // Cola offline: pintar el estado optimista de transiciones aún no sincronizadas.
  const effective = useMemo(() => {
    const optimistic = getOptimistic()
    if (Object.keys(optimistic).length === 0) return orders
    return orders.map((o) => {
      const next = optimistic[o.id]
      return next ? { ...o, status: next } : o
    })
  }, [orders])

  const derived = useMemo(() => {
    const available = effective.filter(
      (o) =>
        o.status === 'waiting_driver' &&
        o.driver_id == null &&
        (o.appears_in_queue_at == null || Date.parse(o.appears_in_queue_at) <= now),
    )
    const upcoming = effective.filter(
      (o) =>
        o.driver_id == null &&
        o.status === 'preparing' &&
        o.appears_in_queue_at != null &&
        Date.parse(o.appears_in_queue_at) > now,
    )
    const mine = effective.filter(
      (o) =>
        o.driver_id != null &&
        o.driver_id === myDriverId &&
        ['heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'].includes(o.status),
    )
    const deliveredToday = effective.filter(
      (o) => o.driver_id === myDriverId && o.status === 'delivered' && isToday(o.delivered_at),
    )
    const mySlots = mine.reduce((s, o) => s + (o.occupancy_slots ?? 1), 0)
    const hasOverdueAvailable = available.some((o) => orderUrgency(o, now) === 'overdue')
    return { available, upcoming, mine, deliveredToday, mySlots, hasOverdueAvailable }
  }, [effective, myDriverId, now])

  return { orders: effective, myDriverId, lastSyncOk, refetch, ...derived }
}
