'use client'

import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { canalUnico } from '@/lib/realtime'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { TeamResponse } from '@/lib/types'

/**
 * Fuente ÚNICA de los datos de equipo. Un poll, un canal realtime, tres
 * consumidores (`TransferWatcher`, `Home` y `TeamTab`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ARREGLA — EL CONTADOR QUE DEPENDÍA DE SÍ MISMO
 *
 *   El badge de "Equipo" se alimentaba de un callback `onCount` que solo
 *   disparaba dentro de `TeamTab`… y `TeamTab` solo se monta cuando la pestaña
 *   está activa. O sea: el contador que debería llevarte a la pestaña exigía que
 *   ya estuvieras en ella. Estaba muerto en la práctica.
 *
 *   Además había DOS fetchers de `/driver/team` que no se hablaban: el
 *   `setInterval` de 15s de `TeamTab` y el refetch de `TransferWatcher` en cada
 *   evento realtime, que encima se avisaban por un `CustomEvent`. Ambos se
 *   sustituyen por este store.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN STORE DE MÓDULO Y NO UN HOOK NORMAL
 *
 *   Si el estado viviera dentro del hook, cada componente que llamara a
 *   `useTeam()` montaría su propio poll y su propio canal — exactamente el
 *   problema que se viene a resolver, pero multiplicado por tres. El store vive
 *   en el módulo y se cuenta por referencias: arranca con el primer suscriptor y
 *   se apaga con el último.
 *
 *   `useSyncExternalStore` es lo que hace que los tres consumidores lean el
 *   MISMO snapshot en el mismo render, sin estados desincronizados entre árboles
 *   hermanos (`TransferWatcher` cuelga de `app/layout.tsx`, `Home` no).
 */

const POLL_MS = 15_000

export interface TeamState {
  teamOrders: TeamResponse['teamOrders']
  sentRequests: TeamResponse['sentRequests']
  /** Solicitudes que YO debo responder. Ver la nota de normalización abajo. */
  receivedRequests: TeamResponse['receivedRequests']
  /** `true` hasta que la primera carga resuelve (con éxito o error). */
  loading: boolean
}

const EMPTY: TeamState = {
  teamOrders: [],
  sentRequests: [],
  receivedRequests: [],
  loading: true,
}

let snapshot: TeamState = EMPTY
const listeners = new Set<() => void>()
let refCount = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null = null
let authSub: { unsubscribe: () => void } | null = null
/** Hay sesión utilizable. Sin ella no se pide nada: solo produciría 401. */
let hasSession = false
let visibilityBound = false
/** Evita que dos refrescos solapados se pisen el snapshot. */
let inFlight: Promise<void> | null = null
/**
 * Hubo eventos MIENTRAS había un refresco en vuelo, así que ese refresco puede
 * haber salido antes de que las filas nuevas fueran visibles.
 *
 * Sin esto, el segundo evento se DESCARTABA en vez de coalescer: dos
 * solicitudes creadas con milisegundos de diferencia podían dejar la pila vacía
 * hasta el siguiente poll, 15 segundos después, sobre una ventana de 30. Lo cazó
 * el gate de T3; con una sola solicitud —lo único que probó T1— no se nota.
 */
let refreshAgain = false

function emit(next: TeamState): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * NORMALIZACIÓN: se descartan las solicitudes sin `expiresAt`.
 *
 * No es defensa paranoica, es mantener un invariante: todo lo que sale de aquí
 * tiene ventana, así que `getTransferRemaining` puede ser una función total y
 * ningún componente necesita una rama "y si no hay reloj". En la práctica no se
 * descarta nada: el endpoint ya filtra por `expires_at > now()`, y en PostgREST
 * ese filtro excluye los NULL de todas formas.
 */
function normalizeReceived(
  items: TeamResponse['receivedRequests'],
): TeamResponse['receivedRequests'] {
  return items.filter((r) => r.expiresAt != null)
}

async function refresh(): Promise<void> {
  if (inFlight) {
    refreshAgain = true
    return inFlight
  }
  inFlight = (async () => {
    try {
      const { data } = await api.get<{ data: TeamResponse }>('/driver/team')
      const received = normalizeReceived(data.receivedRequests)
      // Vibrar solo cuando ENTRA una solicitud nueva que me toca responder.
      // Antes se vibraba ante cualquier fila `pending` del realtime, incluidas
      // las que yo mismo acababa de enviar: el móvil avisaba de mi propia
      // pulsación.
      //
      // Ambas comparaciones se leen ANTES de emitir: después, `snapshot` ya es
      // el nuevo y `loading` siempre valdría `false`, con lo que la primera
      // carga vibraría por cada solicitud que ya estuviera esperando.
      const arrived = received.length > snapshot.receivedRequests.length
      const wasFirstLoad = snapshot.loading

      emit({
        teamOrders: data.teamOrders,
        sentRequests: data.sentRequests,
        receivedRequests: received,
        loading: false,
      })

      if (arrived && !wasFirstLoad && typeof navigator !== 'undefined') {
        navigator.vibrate?.([200, 100, 200])
      }
    } catch {
      // Sin sesión de driver todavía o sin red: no romper la app. Se conserva el
      // último snapshot bueno, pero se sale de `loading` para que la UI pueda
      // decidir qué contar (un spinner eterno miente igual que un vacío falso).
      if (snapshot.loading) emit({ ...snapshot, loading: false })
    } finally {
      inFlight = null
      // Una sola pasada extra por ráfaga, no una por evento: se conserva la
      // propiedad de "un solo ciclo" que exigía el gate de T1.
      if (refreshAgain) {
        refreshAgain = false
        void refresh()
      }
    }
  })()
  return inFlight
}

function onVisibility(): void {
  if (!hasSession || document.visibilityState !== 'visible') return
  // Al volver del segundo plano el snapshot puede tener minutos: refrescar ya,
  // sin esperar al siguiente tick del poll.
  void refresh()
}

/**
 * Cierra el canal si hay uno. Idempotente a propósito: `openChannel` lo llama
 * primero, que es lo que impide que un `TOKEN_REFRESHED` deje dos canales vivos
 * sobre la misma tabla y duplique cada evento.
 */
function teardownChannel(): void {
  if (channel !== null) {
    void getSupabaseBrowser().removeChannel(channel)
    channel = null
  }
}

/** Abre el canal CON el token de la sesión vigente. */
function openChannel(): void {
  teardownChannel()
  hasSession = true
  const supabase = getSupabaseBrowser()
  // Nombre único POR APERTURA. `teardownChannel()` acaba de pedir la baja del
  // anterior, pero `removeChannel` es asíncrono y el canal sigue registrado un
  // instante más: pedir `'drv-team'` otra vez devolvía ESE, todavía conectado, y
  // el `.on()` lanzaba. Aquí no hace falta remontar nada para provocarlo — basta
  // un `TOKEN_REFRESHED`, o sea una vez por hora. Ver `lib/realtime.ts`.
  channel = supabase
    .channel(canalUnico('drv-team'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_transfer_requests' },
      (payload) => {
        console.info(
          `[tindivo:team] evento realtime ${payload.eventType} ${new Date().toISOString()}`,
        )
        // La fila no basta para saber si me concierne: hace falta cruzarla con MI
        // driver_id, que solo conoce el endpoint. Se refresca y decide el server.
        void refresh()
      },
    )
    .subscribe((status) => {
      console.info(`[tindivo:team] canal ${status} ${new Date().toISOString()}`)
    })
}

function start(): void {
  const supabase = getSupabaseBrowser()

  // SIN SESIÓN NO SE PIDE NADA, y esto es el arreglo de T3c.
  //
  // Este store arranca al montarse `TransferWatcher`, que vive en
  // `app/layout.tsx` — o sea ANTES del login. Antes se lanzaba un `refresh()` a
  // ciegas que devolvía 401, y peor: se suscribía el canal con el token
  // anónimo, así que los eventos de `order_transfer_requests` no llegaban nunca
  // y la pila dependía del poll. Sobre una ventana de 30s eso son hasta 15s de
  // ceguera ante una solicitud que, si no respondes, te quita el pedido.
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session) return
    supabase.realtime.setAuth(data.session.access_token)
    openChannel()
    void refresh()
  })

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      // Nada de canales huérfanos reintentando con un token muerto.
      teardownChannel()
      hasSession = false
      emit(EMPTY)
      return
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      supabase.realtime.setAuth(session.access_token)
      openChannel()
      void refresh()
    }
  })
  authSub = authListener.subscription

  pollTimer = setInterval(() => {
    // El poll NO corre en segundo plano. Un motorizado con la app abierta en
    // otra pestaña no necesita 4 peticiones por minuto, y el móvil agradece la
    // batería.
    if (hasSession && document.visibilityState === 'visible') void refresh()
  }, POLL_MS)

  if (!visibilityBound) {
    document.addEventListener('visibilitychange', onVisibility)
    visibilityBound = true
  }
}

function stop(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (visibilityBound) {
    document.removeEventListener('visibilitychange', onVisibility)
    visibilityBound = false
  }
  if (authSub !== null) {
    authSub.unsubscribe()
    authSub = null
  }
  teardownChannel()
  hasSession = false
  // El snapshot NO se limpia: si el último consumidor se desmonta y vuelve a
  // montar (cambio de ruta), reaparece con el último dato bueno en vez de un
  // parpadeo a vacío. `loading` solo es `true` la primera vez de verdad.
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

export interface TeamStore extends TeamState {
  refresh: () => Promise<void>
}

/** Datos de equipo compartidos. Llamarlo N veces NO multiplica peticiones. */
export function useTeam(): TeamStore {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )
  return { ...state, refresh }
}

// ─────────────────────────────────────────────────────────────────────────────
// RELOJ ÚNICO DE LAS SOLICITUDES

export interface TransferCountdown {
  /** Ventana completa de la solicitud, en ms. Es el TTL que se le aplicó. */
  totalMs: number
  remainingMs: number
  /** Segundos restantes, redondeados hacia arriba: 0.4s todavía se lee "1". */
  remainingSec: number
  /** 100 → 0 conforme se agota. Pensado para el ancho de una barra. */
  pct: number
  expired: boolean
}

/**
 * ÚNICO cálculo de tiempo restante de una solicitud en toda la app.
 *
 * La ventana sale de la propia fila (`expiresAt - createdAt`), no de una
 * constante. El TTL es configurable (`app_settings.timers.transferTtlSeconds`,
 * 0043) y se resuelve al CREAR la solicitud, así que restar las dos fechas da el
 * valor que de verdad se le aplicó a ESTA solicitud — y sigue siendo correcto
 * aunque mañana alguien cambie el ajuste con solicitudes vivas.
 *
 * Esto sustituye al `remaining / 60 * 100` que había en `transfer-watcher.tsx`,
 * que contaba contra 60s una ventana de 30: la barra arrancaba al 50% y no se
 * llenaba nunca. Una barra que miente entrena a ignorarla.
 *
 * Es una función pura y recibe `now` de fuera: quien la llama usa `useNow()`,
 * que es un ticker compartido, así que dos sitios que pinten la misma solicitud
 * muestran el mismo número en el mismo frame.
 */
export function getTransferRemaining(
  req: { createdAt: string; expiresAt: string | null },
  now: number,
): TransferCountdown {
  const expiresAt = req.expiresAt == null ? Number.NaN : Date.parse(req.expiresAt)
  const createdAt = Date.parse(req.createdAt)

  // Fechas ilegibles: se trata como caducada. Es el lado seguro — la expiración
  // TRANSFIERE el pedido (0130, que revirtió la 0119), así que ante la duda hay
  // que enseñar el aviso de traspaso en curso, no una cuenta atrás inventada.
  if (Number.isNaN(expiresAt) || Number.isNaN(createdAt)) {
    return { totalMs: 0, remainingMs: 0, remainingSec: 0, pct: 0, expired: true }
  }

  const totalMs = Math.max(0, expiresAt - createdAt)
  const remainingMs = Math.max(0, expiresAt - now)

  return {
    totalMs,
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    pct: totalMs === 0 ? 0 : Math.min(100, (remainingMs / totalMs) * 100),
    expired: remainingMs <= 0,
  }
}
