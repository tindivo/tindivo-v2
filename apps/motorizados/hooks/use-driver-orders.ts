'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isToday } from '@/lib/format'
import { getOptimistic } from '@/lib/offline-queue'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { BoardOrder, DriverBusiness } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'

const BOARD_COLUMNS =
  'id,short_id,status,source,customer_name,customer_phone,delivery_address,delivery_reference,order_amount,delivery_fee,payment_intent,driver_id,created_at,estimated_ready_at,ready_early_used,ready_early_at,urgent_since,appears_in_queue_at,occupancy_slots,waiting_at_restaurant_at,delivered_at,client_pays_with,change_to_give,business_id'

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
  const [businesses, setBusinesses] = useState<Record<string, DriverBusiness>>({})
  const [myDriverId, setMyDriverId] = useState<string | null>(null)
  const [lastSyncOk, setLastSyncOk] = useState(true)
  const channelNameRef = useRef(`drv-orders-${crypto.randomUUID()}`)

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

  // Los locales del motorizado cambian de higos a brevas: se piden una vez y se
  // cruzan por id, en vez de re-embeberlos en cada refetch del board.
  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.rpc('driver_businesses').then(({ data }) => {
      const rows = (data ?? []) as DriverBusiness[]
      setBusinesses(Object.fromEntries(rows.map((b) => [b.id, b])))
    })
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
      .channel(channelNameRef.current)
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
    return orders.map((o) => {
      const next = optimistic[o.id]
      const business = businesses[o.business_id] ?? null
      return next ? { ...o, business, status: next } : { ...o, business }
    })
  }, [orders, businesses])

  const derived = useMemo(() => {
    // VISIBLE lo decide la RLS (preparing + waiting_driver, sin motorizado).
    // TOMABLE lo decide este filtro:
    //   - waiting_driver: SIEMPRE, sin condición de tiempo. La comida ya está
    //     lista; esconderla porque appears_in_queue_at siga en el futuro dejaba
    //     el pedido enfriándose sin que nadie pudiera verlo.
    //   - preparing: solo con la ventana abierta, o sea cuando quedan 10
    //     minutos o menos para que esté listo.
    const available = effective.filter(
      (o) =>
        o.driver_id == null &&
        (o.status === 'waiting_driver' ||
          (o.status === 'preparing' &&
            o.appears_in_queue_at != null &&
            Date.parse(o.appears_in_queue_at) <= now)),
    )
    // Visible pero todavía no tomable. `appears_in_queue_at` nulo cae aquí a
    // propósito: es el lado conservador. Antes contaba como tomable, que es
    // justo la interpretación equivocada si el reloj no llegó a arrancar.
    const upcoming = effective.filter(
      (o) =>
        o.driver_id == null &&
        o.status === 'preparing' &&
        (o.appears_in_queue_at == null || Date.parse(o.appears_in_queue_at) > now),
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
