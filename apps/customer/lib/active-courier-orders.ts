'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CourierStatus } from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
import { useEffect } from 'react'
import { create } from 'zustand'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Estados vivos de `courier_orders` — complemento de `delivered`/`cancelled` (0232). */
export const ACTIVE_COURIER_STATUSES: readonly CourierStatus[] = [
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
 * Tres caminos para enterarse, porque cualquiera de ellos solo puede fallar:
 *
 *   · Realtime sobre `courier_orders` (0239; antes de esa migración la tabla
 *     no estaba en la publicación y el canal nunca recibió nada).
 *   · `recargar()` explícito al crear una entrega (`useCourierRequest`): quien
 *     acaba de pedir vuelve al home y tiene que ver «Entrega en curso» ya, no
 *     cuando llegue el evento.
 *   · Volver a la pestaña: en el celular el WebSocket muere con la app en
 *     segundo plano y lo que pasó mientras tanto no se reenvía.
 *
 * Y un oyente de sesión: entrar con correo no recarga la página, y sin él el
 * store se quedaba con la lista vacía del visitante anónimo.
 */
interface ActiveCourierOrdersState {
  orders: ActiveCourierOrder[]
  loaded: boolean
  load: () => Promise<void>
  recargar: () => Promise<void>
  reset: () => void
}

let inFlight: Promise<void> | null = null
/** Cada carga lleva un número; solo la última escribe (una vieja no pisa a una nueva). */
let ultimaPeticion = 0

async function leerUserId(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return data.session?.user.id ?? null
}

async function cargar(): Promise<void> {
  const peticion = ++ultimaPeticion
  const userId = await leerUserId()
  let orders: ActiveCourierOrder[] = []
  if (userId) {
    const { data, error } = await getSupabaseBrowser()
      .from('courier_orders')
      .select('short_id,status,origin_name,driver_id,created_at')
      .eq('customer_user_id', userId)
      .in('status', ACTIVE_COURIER_STATUSES)
      .order('created_at', { ascending: false })
    // Un fallo de red no borra lo que había: mejor un banner un poco viejo
    // que hacer desaparecer una entrega en curso.
    if (error) return

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
  if (peticion !== ultimaPeticion) return
  useActiveCourierOrdersStore.setState({ orders, loaded: true })
}

function arrancarCarga(): Promise<void> {
  inFlight ??= cargar().finally(() => {
    inFlight = null
  })
  return inFlight
}

let canal: RealtimeChannel | null = null
let suscriptores = 0
let bajaAuth: (() => void) | null = null
let primerEventoAuth = true
let usuarioConocido: string | null = null

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
      () => void arrancarCarga(),
    )
    .subscribe()
}

function cerrarCanal(): void {
  if (!canal) return
  const muerto = canal
  canal = null
  getSupabaseBrowser().removeChannel(muerto)
}

/** Mismo patrón que `engancharAuth` de `active-orders.ts`: uno global, no uno por consumidor. */
function engancharAuth(): void {
  if (bajaAuth) return
  primerEventoAuth = true
  const { data } = getSupabaseBrowser().auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user.id ?? null
    if (primerEventoAuth) {
      primerEventoAuth = false
      usuarioConocido = usuario
      return
    }
    // `TOKEN_REFRESHED` llega cada hora con la misma persona: no es motivo.
    if (usuario === usuarioConocido) return
    usuarioConocido = usuario
    cerrarCanal()
    void arrancarCarga().then(abrirCanal)
  })
  bajaAuth = () => data.subscription.unsubscribe()
}

function alVolver(): void {
  if (document.visibilityState === 'visible') void arrancarCarga()
}

export const useActiveCourierOrdersStore = create<ActiveCourierOrdersState>((_set, get) => ({
  orders: [],
  loaded: false,

  load: () => {
    if (inFlight) return inFlight
    if (get().loaded) return Promise.resolve()
    return arrancarCarga()
  },

  recargar: () => arrancarCarga(),

  reset: () => {
    cerrarCanal()
    usuarioConocido = null
    ultimaPeticion += 1
    inFlight = null
    useActiveCourierOrdersStore.setState({ orders: [], loaded: false })
  },
}))

/** Entregas activas del cliente, vivas. Ver `useActiveOrders` (pedidos). */
export function useActiveCourierOrders(): ActiveCourierOrder[] {
  const orders = useActiveCourierOrdersStore((s) => s.orders)
  const load = useActiveCourierOrdersStore((s) => s.load)

  useEffect(() => {
    suscriptores += 1
    engancharAuth()
    if (suscriptores === 1) document.addEventListener('visibilitychange', alVolver)
    void load().then(abrirCanal)
    return () => {
      suscriptores -= 1
      if (suscriptores === 0) {
        cerrarCanal()
        bajaAuth?.()
        bajaAuth = null
        document.removeEventListener('visibilitychange', alVolver)
      }
    }
  }, [load])

  return orders
}
