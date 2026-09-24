'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CourierStatus } from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
import { useEffect } from 'react'
import { create } from 'zustand'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Estados vivos de `courier_orders` — complemento de `delivered`/`cancelled` (0232). */
const ACTIVE_COURIER_STATUSES: readonly CourierStatus[] = [
  'requested',
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'picked_up',
  'heading_to_dropoff',
]

/** Una entrega del cliente que sigue viva. */
export interface ActiveCourierOrder {
  shortId: string
  status: CourierStatus
  originName: string
  driverName: string | null
  createdAt: string
}

/**
 * Entregas activas del cliente, en un solo sitio — hermano de
 * `lib/active-orders.ts` (mismo motivo: `BottomNav` y el banner del home no
 * se conocen entre sí, y sin esto cada uno haría su propia consulta).
 *
 * Deliberadamente MÁS SIMPLE que `active-orders.ts`: con
 * `maxActivePerPhone` en 1 el caso normal es 0 o 1 fila, así que no hace
 * falta la coreografía de tokens de request-en-vuelo ni el oyente de
 * transición de sesión — un cliente que cambia de cuenta ya dispara `reset()`
 * desde `lib/sign-out.ts` como el resto de stores de sesión.
 */
interface ActiveCourierOrdersState {
  orders: ActiveCourierOrder[]
  loaded: boolean
  load: () => Promise<void>
  reset: () => void
}

async function leerUserId(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return data.session?.user.id ?? null
}

async function cargar(): Promise<void> {
  const userId = await leerUserId()
  let orders: ActiveCourierOrder[] = []
  if (userId) {
    const { data } = await getSupabaseBrowser()
      .from('courier_orders')
      .select('short_id,status,origin_name,driver_id,created_at')
      .eq('customer_user_id', userId)
      .in('status', ACTIVE_COURIER_STATUSES)
      .order('created_at', { ascending: false })

    /*
     * El nombre del motorizado NO se lee de `drivers` directo: la RLS de esa
     * tabla (0004) solo deja pasar al admin y al PROPIO motorizado
     * (`user_id = auth.uid()`), nunca al cliente — aunque sea el dueño del
     * pedido. `get_courier_tracking` (0232) sí lo trae, porque es
     * `SECURITY DEFINER` y no pasa por esa RLS. Con `maxActivePerPhone=1` el
     * caso normal es 0 o 1 fila, así que llamarla por cada activa no pesa.
     */
    const conDriver = (data ?? []).filter((o) => o.driver_id)
    const nombres = new Map<string, string | null>()
    await Promise.all(
      conDriver.map(async (o) => {
        const { data: tracking } = await getSupabaseBrowser().rpc('get_courier_tracking', {
          p_short_id: o.short_id,
        })
        nombres.set(o.short_id, (tracking as { driverName?: string } | null)?.driverName ?? null)
      }),
    )

    orders = (data ?? []).map((o) => ({
      shortId: o.short_id,
      status: o.status,
      originName: o.origin_name,
      driverName: nombres.get(o.short_id) ?? null,
      createdAt: o.created_at,
    }))
  }
  useActiveCourierOrdersStore.setState({ orders, loaded: true })
}

let canal: RealtimeChannel | null = null
let suscriptores = 0

async function abrirCanal(): Promise<void> {
  if (canal) return
  const userId = await leerUserId()
  if (!userId || canal || suscriptores === 0) return
  canal = getSupabaseBrowser()
    .channel(canalUnico(`active-courier-orders-${userId}`))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'courier_orders',
        filter: `customer_user_id=eq.${userId}`,
      },
      () => void cargar(),
    )
    .subscribe()
}

function cerrarCanal(): void {
  if (!canal) return
  const muerto = canal
  canal = null
  getSupabaseBrowser().removeChannel(muerto)
}

export const useActiveCourierOrdersStore = create<ActiveCourierOrdersState>((_set, get) => ({
  orders: [],
  loaded: false,

  load: () => {
    if (get().loaded) return Promise.resolve()
    return cargar()
  },

  reset: () => {
    cerrarCanal()
    useActiveCourierOrdersStore.setState({ orders: [], loaded: false })
  },
}))

/** Entregas activas del cliente, vivas por Realtime. Ver `useActiveOrders` (pedidos). */
export function useActiveCourierOrders(): ActiveCourierOrder[] {
  const orders = useActiveCourierOrdersStore((s) => s.orders)
  const load = useActiveCourierOrdersStore((s) => s.load)

  useEffect(() => {
    suscriptores += 1
    void load().then(abrirCanal)
    return () => {
      suscriptores -= 1
      if (suscriptores === 0) cerrarCanal()
    }
  }, [load])

  return orders
}
