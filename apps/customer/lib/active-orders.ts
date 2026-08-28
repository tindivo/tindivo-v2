'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { ACTIVE_ORDER_STATUSES } from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
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
 * Vive en `lib/` y no en una feature porque lo piden consumidores que no se
 * conocen entre sí: la `BottomNav` del layout (el badge), la portada (el banner
 * del pedido en curso), la ficha del negocio (bloquea pedir dos veces al mismo
 * sitio) y `/cuenta` (el contador de la tarjeta «Pedidos»).
 *
 * Antes cada uno montaba su propio `useState` + `useEffect`, así que en la
 * portada y en `/negocio/:id` se pedía DOS veces lo mismo, y en `/cuenta` una
 * tercera consulta a `orders` que además estaba rota. El store hace una sola
 * consulta y una sola suscripción de Realtime para todos.
 */
interface ActiveOrdersState {
  orders: ActiveOrder[]
  /** `false` hasta la primera respuesta: distingue «no tiene» de «aún no sé». */
  loaded: boolean
  /** Carga en curso, para que el segundo consumidor se enganche a ella. */
  inFlight: Promise<void> | null
  /** Carga si nadie la está haciendo ya. Lo que usan los consumidores al montar. */
  load: () => Promise<void>
  /** Carga SIEMPRE, aunque haya una en vuelo. Para eventos de Realtime. */
  recargar: () => Promise<void>
  reset: () => void
}

async function leerUserId(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Cuál fue la última carga pedida.
 *
 * Con Realtime puede haber dos consultas en vuelo (la del montaje y la que
 * dispara un evento) y nada garantiza que lleguen en orden. Sin este testigo,
 * una respuesta vieja puede pisar a una nueva y dejar el badge mintiendo hasta
 * el siguiente evento.
 */
let ultimaPeticion = 0

async function traerYAplicar(): Promise<void> {
  const token = ++ultimaPeticion
  const userId = await leerUserId()

  let orders: ActiveOrder[] = []
  if (userId) {
    const { data } = await getSupabaseBrowser()
      .from('orders')
      .select('short_id,status,business_id,created_at')
      .eq('customer_user_id', userId)
      .in('status', [...ACTIVE_ORDER_STATUSES])
      .order('created_at', { ascending: false })

    orders = (data ?? []).map((o) => ({
      shortId: o.short_id,
      status: o.status,
      businessId: o.business_id,
      createdAt: o.created_at,
    }))
  }

  if (token !== ultimaPeticion) return
  useActiveOrdersStore.setState({ orders, loaded: true })
}

function arrancarCarga(): Promise<void> {
  const promesa = traerYAplicar()
    .catch(() => {
      // Un fallo de red no debe dejar el badge girando para siempre: se marca
      // como resuelto con lo último que se supo y el próximo evento reintenta.
      useActiveOrdersStore.setState({ loaded: true })
    })
    .finally(() => {
      // Solo la carga MÁS RECIENTE puede limpiar el testigo: si no, una vieja
      // que termina tarde dejaría a los que montan creyendo que no hay nada en
      // vuelo y dispararían una consulta de más.
      if (useActiveOrdersStore.getState().inFlight === promesa) {
        useActiveOrdersStore.setState({ inFlight: null })
      }
    })

  useActiveOrdersStore.setState({ inFlight: promesa })
  return promesa
}

// ── Realtime: un canal para todos los consumidores ──────────────────────────

let canal: RealtimeChannel | null = null
let suscriptores = 0
let bajaAuth: (() => void) | null = null
let usuarioConocido: string | null = null
let primerEventoAuth = true

async function abrirCanal(): Promise<void> {
  if (canal) return
  const userId = await leerUserId()
  // Se recomprueba tras el await: otro consumidor pudo abrirlo mientras tanto,
  // o el último pudo haberse ido y ya no hacer falta.
  if (!userId || canal || suscriptores === 0) return

  // Nombre único por suscripción, no fijo: `removeChannel` es asíncrono y quien
  // pida el mismo nombre dentro de esa ventana recibe el canal viejo todavía
  // conectado, y su `.on()` lanza. Ver `canalUnico` en `@tindivo/supabase`.
  canal = getSupabaseBrowser()
    .channel(canalUnico(`active-orders-${userId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `customer_user_id=eq.${userId}` },
      () => {
        void useActiveOrdersStore.getState().recargar()
      },
    )
    .subscribe((estado) => {
      // Sin canal no hay frescura, y `load()` ya no reconsulta cuando hay datos.
      // Marcarlo como no cargado devuelve la red de seguridad: el próximo
      // montaje vuelve a consultar en vez de fiarse de un feed muerto.
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
        useActiveOrdersStore.setState({ loaded: false })
      }
    })
}

/**
 * Un solo oyente de sesión para todos los consumidores.
 *
 * Estuvo dentro del `useEffect` del hook, es decir uno POR consumidor, y en
 * `/cuenta` hay dos (la BottomNav y la propia pantalla): cada uno recargaba al
 * restaurarse la sesión y las consultas a `orders` pasaron de 2 a 5. El store
 * es global; su oyente también tiene que serlo.
 */
function engancharAuth(): void {
  if (bajaAuth) return
  primerEventoAuth = true

  const { data } = getSupabaseBrowser().auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user.id ?? null

    // El PRIMER evento es siempre la sesión que ya existía al registrarse. El
    // montaje acaba de cargar con ella, así que solo sirve de línea base.
    if (primerEventoAuth) {
      primerEventoAuth = false
      usuarioConocido = usuario
      return
    }

    // Después, solo si cambia de persona. `onAuthStateChange` dispara también
    // en cada `TOKEN_REFRESHED` —una vez por hora sin que nadie navegue—, y
    // recargar por eso sería una consulta de más sin nada nuevo detrás.
    if (usuario === usuarioConocido) return
    usuarioConocido = usuario
    cerrarCanal()
    void useActiveOrdersStore.getState().recargar().then(abrirCanal)
  })

  bajaAuth = () => {
    data.subscription.unsubscribe()
  }
}

function soltarAuth(): void {
  if (!bajaAuth) return
  bajaAuth()
  bajaAuth = null
}

function cerrarCanal(): void {
  if (!canal) return
  const muerto = canal
  canal = null
  getSupabaseBrowser().removeChannel(muerto)
}

export const useActiveOrdersStore = create<ActiveOrdersState>((_set, get) => ({
  orders: [],
  loaded: false,
  inFlight: null,

  /**
   * Lo que llaman los consumidores al montar.
   *
   * No reconsulta si ya hay datos: de eso se encarga Realtime. Antes recargaba
   * en cada montaje y el dedup solo cubría llamadas CONCURRENTES, así que en
   * `/cuenta` —donde montan la BottomNav y la pantalla— bastaba con que la
   * primera consulta terminase antes de que montara la segunda para que se
   * pidiera lo mismo dos veces. Salía rojo solo cuando el cliente tenía pedidos
   * de verdad, que es cuando la respuesta llega más tarde.
   *
   * Si el canal se cayó, `loaded` vuelve a `false` (ver `abrirCanal`) y el
   * próximo montaje sí consulta: sin feed, lo que hay puede estar viejo.
   */
  load: () => {
    const { inFlight, loaded } = get()
    if (inFlight) return inFlight
    if (loaded) return Promise.resolve()
    return arrancarCarga()
  },

  recargar: () => arrancarCarga(),

  /** Al cerrar sesión: los pedidos de quien salió no son de quien entre después. */
  reset: () => {
    cerrarCanal()
    usuarioConocido = null
    ultimaPeticion += 1 // invalida cualquier respuesta en vuelo del que salió
    useActiveOrdersStore.setState({ orders: [], loaded: false, inFlight: null })
  },
}))

/**
 * Los pedidos activos del cliente, vivos.
 *
 * Carga al montar y se mantiene al día por Realtime. Varios componentes pueden
 * usarlo a la vez: comparten una consulta y un canal, y el canal se cierra
 * cuando se va el último.
 */
export function useActiveOrders(): ActiveOrder[] {
  const orders = useActiveOrdersStore((s) => s.orders)
  const load = useActiveOrdersStore((s) => s.load)

  useEffect(() => {
    suscriptores += 1
    engancharAuth()
    void load().then(abrirCanal)

    return () => {
      suscriptores -= 1
      // El canal y el oyente se van con el último: son de todos, no de este.
      if (suscriptores === 0) {
        cerrarCanal()
        soltarAuth()
      }
    }
  }, [load])

  return orders
}
