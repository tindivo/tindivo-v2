'use client'

import { canalUnico } from '@tindivo/supabase'
import { useMemo, useSyncExternalStore } from 'react'
import { isToday } from '@/lib/format'
import { getOptimistic, queueSize } from '@/lib/offline-queue'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { flushQueue } from '@/lib/transitions'
import type { BoardOrder, DriverBusiness } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'

const BOARD_COLUMNS =
  'id,short_id,status,source,customer_name,customer_phone,delivery_address,delivery_reference,order_amount,delivery_fee,payment_intent,driver_id,created_at,estimated_ready_at,ready_early_used,ready_early_at,urgent_since,appears_in_queue_at,occupancy_slots,waiting_at_restaurant_at,picked_up_at,delivered_at,payment_real,cash_owed_at_delivery,client_pays_with,change_to_give,cash_amount,yape_amount,business_id,delivery_method,delivery_distance_band,delivery_coordinates_lat,delivery_coordinates_lng'

export interface DriverBoard {
  orders: BoardOrder[]
  myDriverId: string | null
  /** Nombre completo del motorizado. Lo consume la shell (saludo + iniciales). */
  myName: string | null
  lastSyncOk: boolean
  /**
   * `true` hasta que la PRIMERA carga resuelve, con éxito o con error.
   *
   * Distingue "todavía no sé" de "sé que está vacío", que es una diferencia que
   * el board no podía expresar: arrancaba con `orders: []` y quien lo leía no
   * tenía forma de saber si eso era la verdad o el estado inicial.
   */
  loading: boolean
  refetch: () => Promise<void>
  available: BoardOrder[]
  upcoming: BoardOrder[]
  mine: BoardOrder[]
  deliveredToday: BoardOrder[]
  mySlots: number
  hasOverdueAvailable: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE DE MÓDULO
//
// POR QUÉ UN STORE Y NO UN HOOK NORMAL — mismo razonamiento que `useTeam`, y
// aquí costaba el doble.
//
//   `CapacityIndicator` cuelga de `DriverShell`, así que se monta en TODAS las
//   rutas del grupo `(driver)`. Llamaba a este hook para pintar «1/3». La página
//   también lo llamaba. Con el estado dentro del hook eso eran DOS instancias
//   completas en todas partes: dos consultas de 50 pedidos, dos RPC de locales,
//   dos consultas a `drivers`, dos polls de 15s… y DOS CANALES REALTIME SOBRE
//   `orders`, que es lo caro de verdad: un solo cambio de fila disparaba dos
//   refetches completos del board en vez de uno.
//
//   Medido contra `tindivo-prod`: las 50 filas de `BOARD_COLUMNS` pesan ~25 KB
//   en crudo, así que la respuesta ronda los 50 KB. Eran 8 fetches por minuto
//   donde bastan 4, sobre la señal de un pueblo y con la app abierta toda la
//   noche.
//
//   Y `/restaurantes` y `/perfil` pagaban ese board entero sin tener ningún
//   tablero en pantalla: solo por el indicador de mochila de la barra.
//
// EL RELOJ NO ENTRA AQUÍ. El store guarda los datos; los filtros que dependen
// de `now` viven en el hook, alimentados por el `useNow()` de quien llama.
// Meter el reloj dentro obligaría a despertar a todos los suscriptores cada
// segundo, que es cambiar un problema por otro.
// ─────────────────────────────────────────────────────────────────────────────

interface BoardSnapshot {
  /** Pedidos YA cruzados con su local y con la cola offline aplicada. */
  orders: BoardOrder[]
  myDriverId: string | null
  myName: string | null
  lastSyncOk: boolean
  loading: boolean
}

const EMPTY: BoardSnapshot = {
  orders: [],
  myDriverId: null,
  myName: null,
  lastSyncOk: true,
  loading: true,
}

let snapshot: BoardSnapshot = EMPTY
const listeners = new Set<() => void>()
let refCount = 0

/** Crudo del servidor, sin cruzar. Se conserva para poder recombinar. */
let rawOrders: BoardOrder[] = []
let businesses: Record<string, DriverBusiness> = {}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollStart: ReturnType<typeof setTimeout> | null = null
let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null = null
let visibilityBound = false

/**
 * De QUÉ usuario son los datos que hay en el snapshot.
 *
 * ESTO NO ES DEFENSA PARANOICA: es lo que impide una fuga entre sesiones que el
 * store introduce y el hook no tenía.
 *
 * `stop()` conserva el snapshot a propósito —si no, cada cambio de ruta
 * parpadearía a vacío—, pero eso significa que los pedidos del motorizado que
 * acaba de salir siguen en memoria cuando entra el siguiente. Antes no pasaba:
 * cada montaje del hook arrancaba con `useState([])` y `loading: true`, así que
 * lo que se veía era un skeleton. Con el store se verían las tarjetas del
 * ANTERIOR hasta que resolviera el primer refetch — en una app de dos
 * motorizados donde los pedidos se traspasan, eso es enseñarle a uno el trabajo
 * del otro.
 *
 * Se compara el `user.id` de la sesión en cada arranque en vez de escuchar
 * `SIGNED_OUT`: el evento puede caer con el store parado (nadie suscrito) y
 * entonces no lo oiría nadie. La comparación no se puede perder.
 */
let loadedForUserId: string | null = null

/**
 * Invalida los arranques en vuelo.
 *
 * `start()` lee la sesión de forma asíncrona antes de consultar. Entre que la
 * pide y la recibe, StrictMode puede haber desmontado y remontado el árbol —o
 * sea `stop()` y otro `start()`—, y la continuación del primero escribiría sobre
 * el estado del segundo. Cada arranque se queda con su número y comprueba que
 * sigue siendo el vigente antes de tocar nada.
 */
let generation = 0

function emit(next: BoardSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * Cruza los pedidos con su local y aplica la cola offline.
 *
 * SE HACE UNA VEZ, EN EL STORE, y no en cada consumidor: era un `useMemo` por
 * instancia del hook, o sea el mismo recorrido sobre 50 pedidos repetido tantas
 * veces como componentes leyeran el board. `getOptimistic()` además lee
 * `localStorage` y hace `JSON.parse`, que es síncrono y bloquea el hilo.
 *
 * Se recalcula exactamente cuando se recalculaba antes —al cambiar los pedidos
 * o los locales—, así que el comportamiento es el mismo.
 */
function recombine(): BoardOrder[] {
  const optimistic = getOptimistic()
  return rawOrders.map((o) => {
    const next = optimistic[o.id]
    const business = businesses[o.business_id] ?? null
    return next ? { ...o, business, status: next } : { ...o, business }
  })
}

async function refetch(): Promise<void> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from('orders')
    .select(BOARD_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  // Un error tampoco deja el board en "cargando": un spinner eterno miente
  // igual que un vacío falso. Se sale de `loading` y `lastSyncOk` cuenta la
  // otra mitad de la verdad.
  if (error) {
    emit({ ...snapshot, lastSyncOk: false, loading: false })
    return
  }
  rawOrders = (data ?? []).map((o) => ({
    ...o,
    order_amount: Number(o.order_amount),
    delivery_fee: Number(o.delivery_fee),
    client_pays_with: o.client_pays_with == null ? null : Number(o.client_pays_with),
    change_to_give: o.change_to_give == null ? null : Number(o.change_to_give),
  })) as BoardOrder[]
  emit({ ...snapshot, orders: recombine(), lastSyncOk: true, loading: false })
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void refetch()
}

function start(): void {
  const gen = ++generation
  const supabase = getSupabaseBrowser()

  // LOS DATOS VAN DETRÁS DE LA SESIÓN, el canal y el poll no.
  //
  // `getSession()` resuelve desde memoria/cookies sin salir a la red, así que
  // esto no añade latencia real; lo que añade es saber PARA QUIÉN se está
  // cargando antes de reutilizar nada de lo que quedó en memoria.
  void supabase.auth.getSession().then(({ data }) => {
    // Este arranque ya fue reemplazado (StrictMode, o un cambio de ruta rápido).
    if (gen !== generation) return

    const uid = data.session?.user.id ?? null
    if (uid !== loadedForUserId) {
      // Sesión distinta a la del snapshot: se tira todo y se vuelve a
      // `loading`, que es lo que hacía el hook al montarse. Un motorizado nunca
      // ve, ni por un frame, los pedidos del anterior.
      loadedForUserId = uid
      rawOrders = []
      businesses = {}
      emit(EMPTY)
    }

    // UNA SOLA CONSULTA A `drivers`, y antes eran tres para leer la misma fila:
    // dos pedían `id` (una por instancia del hook) y una tercera pedía
    // `full_name` desde `DriverShell`. Ahora sale de aquí y la shell la lee del
    // store.
    supabase
      .from('drivers')
      .select('id,full_name')
      .maybeSingle()
      .then(({ data: row }) => {
        if (gen !== generation) return
        emit({
          ...snapshot,
          myDriverId: (row?.id as string | null) ?? null,
          myName: (row?.full_name as string | null) ?? null,
        })
      })

    // Los locales del motorizado cambian de higos a brevas: se piden una vez y
    // se cruzan por id, en vez de re-embeberlos en cada refetch del board.
    supabase.rpc('driver_businesses').then(({ data: rows }) => {
      if (gen !== generation) return
      businesses = Object.fromEntries(((rows ?? []) as DriverBusiness[]).map((b) => [b.id, b]))
      // Los pedidos pueden haber llegado antes que los locales: recombinar para
      // que la franja de acento y el nombre del local aparezcan sin esperar al
      // siguiente refetch.
      emit({ ...snapshot, orders: recombine() })
    })

    void refetch()
  })

  // El nombre se genera DENTRO de `start`. Estaba en un `useRef`, y un ref
  // sobrevive al ciclo desmontar-montar de StrictMode: la segunda suscripción
  // pedía exactamente el mismo topic que la primera, que aún no había
  // terminado de darse de baja. Ver `canalUnico` en `@tindivo/supabase`.
  //
  // Con el store el riesgo es el mismo pero por otra vía: StrictMode monta,
  // desmonta y vuelve a montar, así que `stop()` corre entre dos `start()`.
  // Un topic nuevo por apertura es lo que hace que eso sea inofensivo.
  channel = supabase
    .channel(canalUnico('drv-orders'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      void refetch()
    })
    .subscribe()

  document.addEventListener('visibilitychange', onVisible)
  visibilityBound = true

  // ── POLL DE RESPALDO. No sustituye al realtime: lo cubre donde no llega.
  //
  // El realtime de `orders` va filtrado por RLS, así que cuando una fila DEJA
  // de ser visible para ti el evento no llega. Es una clase entera de
  // silencios, no un caso suelto: un traspaso que te quita el pedido, una
  // reasignación del admin, una cancelación desde negocios. En todos, tu
  // pantalla se queda enseñando algo que ya no es tuyo.
  //
  // Con la 0130 eso pasó de molesto a caro: el silencio transfiere, y sin este
  // poll el motorizado conduce al local a por comida que ya recogió otro. Solo
  // se descubría al minimizar la app y volver (`visibilitychange`).
  //
  // DESFASADO 7s RESPECTO A `useTeam`, que sondea a los 15s exactos. Son
  // endpoints distintos —board por supabase directo, equipo por la API—, así
  // que no son el fetcher duplicado que T1 eliminó; pero salir a la vez cada
  // 15s es una estampida gratuita en un móvil con datos móviles. Desfasar es
  // más simple que compartir un ticker entre dos stores que no se conocen.
  //
  // EL DESFASE SIGUE HACIENDO FALTA con un solo board: lo que se eliminó fue el
  // board duplicado contra sí mismo, no la coincidencia con el poll de equipo.
  const POLL_MS = 15_000
  const POLL_OFFSET_MS = 7_000
  pollStart = setTimeout(() => {
    pollTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // La cola se reintenta AQUÍ y no solo con el evento `online`, porque ese
      // evento habla del dispositivo, no del servidor. Cuando quien falla es
      // la API —un despliegue, un 502 pasajero— el celular nunca se queda sin
      // red, `online` no dispara nunca y la transición se queda encolada para
      // siempre. Con ella, el estado optimista deja el pedido invisible en el
      // board: ni disponible ni mío. Reintentar con el poll cierra ese agujero
      // sin añadir temporizadores nuevos.
      if (queueSize() > 0) void flushQueue()
      void refetch()
    }, POLL_MS)
  }, POLL_OFFSET_MS)
}

function stop(): void {
  // Invalida cualquier `start()` que siga esperando su `getSession()`: sin esto,
  // su continuación abriría consultas después de haberse parado el store.
  generation++
  if (pollStart !== null) {
    clearTimeout(pollStart)
    pollStart = null
  }
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (visibilityBound) {
    document.removeEventListener('visibilitychange', onVisible)
    visibilityBound = false
  }
  if (channel !== null) {
    void getSupabaseBrowser().removeChannel(channel)
    channel = null
  }
  // El snapshot NO se limpia, igual que en `useTeam`: si el último consumidor
  // se desmonta y vuelve a montar (un cambio de ruta), reaparece con el último
  // dato bueno en vez de un parpadeo a vacío. `loading` solo es `true` la
  // primera vez de verdad.
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  refCount += 1
  if (refCount === 1) start()
  return () => {
    listeners.delete(onChange)
    refCount -= 1
    if (refCount === 0) stop()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORES SIN RELOJ
//
// Los dos consumidores que viven en la shell —el nombre del motorizado y el
// indicador de mochila— no necesitan `now`, y pedirlo les salía caro: llamaban
// a `useDriverOrders(useNow())` y se repintaban UNA VEZ POR SEGUNDO, arrastrando
// consigo todo el árbol que cuelga de `DriverShell`, para enseñar un valor que
// no puede cambiar entre tick y tick.
//
// `mySlots` no depende del tiempo: sale de filtrar por `driver_id` y por estado,
// y ninguna de las dos cosas la mueve el reloj. Lo mismo el nombre.
//
// Devuelven primitivas a propósito. `useSyncExternalStore` compara el resultado
// de `getSnapshot` por identidad, así que un número o un string se pueden
// calcular al vuelo sin memoizar; un array o un objeto nuevo en cada lectura
// haría que React no converja nunca.
// ─────────────────────────────────────────────────────────────────────────────

function slotsOf(s: BoardSnapshot): number {
  let total = 0
  for (const o of s.orders) {
    if (
      o.driver_id != null &&
      o.driver_id === s.myDriverId &&
      ['heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'].includes(o.status)
    ) {
      total += o.occupancy_slots ?? 1
    }
  }
  return total
}

/** Slots ocupados de la mochila. Sin reloj: no cambia con el tiempo. */
export function useMySlots(): number {
  return useSyncExternalStore(
    subscribe,
    () => slotsOf(snapshot),
    () => 0,
  )
}

/** Nombre completo del motorizado, para el saludo y las iniciales de la shell. */
export function useDriverName(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.myName,
    () => null,
  )
}

/**
 * Board del motorizado: supabase directo (RLS) + realtime + derivados.
 *
 * Llamarlo N veces NO multiplica peticiones ni canales.
 */
export function useDriverOrders(now: number): DriverBoard {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )

  const derived = useMemo(() => {
    const effective = state.orders
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
        o.driver_id === state.myDriverId &&
        ['heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'].includes(o.status),
    )
    const deliveredToday = effective.filter(
      (o) =>
        o.driver_id === state.myDriverId && o.status === 'delivered' && isToday(o.delivered_at),
    )
    const mySlots = mine.reduce((s, o) => s + (o.occupancy_slots ?? 1), 0)
    const hasOverdueAvailable = available.some((o) => orderUrgency(o, now) === 'overdue')
    return { available, upcoming, mine, deliveredToday, mySlots, hasOverdueAvailable }
  }, [state.orders, state.myDriverId, now])

  return { ...state, refetch, ...derived }
}
