'use client'

import { ACTIVE_ORDER_STATUSES } from '@tindivo/contracts'
import { useEffect } from 'react'
import { create } from 'zustand'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Un pedido del cliente que sigue vivo (ni entregado ni cancelado). */
export interface ActiveOrder {
  shortId: string
  status: string
  businessId: string
  createdAt: string
}

/**
 * Los pedidos activos del cliente, en un solo sitio.
 *
 * Vive en `lib/` y no en una feature porque lo piden tres consumidores que no
 * se conocen entre sí: la `BottomNav` del layout (el badge), la ficha del
 * negocio (bloquea pedir dos veces al mismo sitio) y `/cuenta` (el contador de
 * la tarjeta «Pedidos»).
 *
 * Antes cada uno montaba su propio `useState` + `useEffect`, así que en
 * `/negocio/:id` se pedía DOS veces lo mismo (BottomNav + shell) y en `/cuenta`
 * una tercera consulta a `orders` que además estaba rota. El store no cambia
 * cuándo se recarga —sigue siendo en cada montaje, como antes—, solo impide que
 * dos islas que montan en el mismo commit disparen dos consultas idénticas.
 */
interface ActiveOrdersState {
  orders: ActiveOrder[]
  /** `false` hasta la primera respuesta: distingue «no tiene» de «aún no sé». */
  loaded: boolean
  /** Consulta en curso, para que el segundo consumidor se enganche a ella. */
  inFlight: Promise<void> | null
  load: () => Promise<void>
  reset: () => void
}

async function fetchActiveOrders(): Promise<ActiveOrder[]> {
  const supabase = getSupabaseBrowser()
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return []

  const { data } = await supabase
    .from('orders')
    .select('short_id,status,business_id,created_at')
    .eq('customer_user_id', userId)
    .in('status', [...ACTIVE_ORDER_STATUSES])
    .order('created_at', { ascending: false })

  return (data ?? []).map((o) => ({
    shortId: o.short_id,
    status: o.status,
    businessId: o.business_id,
    createdAt: o.created_at,
  }))
}

export const useActiveOrdersStore = create<ActiveOrdersState>((set, get) => ({
  orders: [],
  loaded: false,
  inFlight: null,

  load: () => {
    const running = get().inFlight
    if (running) return running

    const promise = fetchActiveOrders()
      .then((orders) => {
        set({ orders, loaded: true })
      })
      .catch(() => {
        // Un fallo de red no debe dejar el badge girando para siempre: se marca
        // como resuelto con lo último que se supo y el próximo montaje reintenta.
        set({ loaded: true })
      })
      .finally(() => {
        set({ inFlight: null })
      })

    // Síncrono tras crear la promesa: ningún `.then` puede haber corrido aún,
    // así que el segundo consumidor del mismo commit ya encuentra el `inFlight`.
    set({ inFlight: promise })
    return promise
  },

  /** Al cerrar sesión: los pedidos de quien salió no son de quien entre después. */
  reset: () => {
    set({ orders: [], loaded: false, inFlight: null })
  },
}))

/** Los pedidos activos del cliente. Recarga al montar; deduplica en vuelo. */
export function useActiveOrders(): ActiveOrder[] {
  const orders = useActiveOrdersStore((s) => s.orders)
  const load = useActiveOrdersStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  return orders
}
