'use client'

import { ApiError } from '@tindivo/api-client'
import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type AvailabilityState = {
  available: boolean
  withinSchedule: boolean
}

/**
 * Indica si hay sesión Supabase activa. Mismo guard que usa
 * `use-push-subscription`: sin sesión, la request sale sin Bearer y el endpoint
 * responde 401. `getSession()` resuelve desde memoria/cookies sin hit de red.
 */
async function hasActiveSession(): Promise<boolean> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return Boolean(data.session)
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE COMPARTIDO. Dos consumidores, una petición.
//
// `ShiftStatus` (en la barra superior, o sea en TODAS las rutas) lo lee, y
// `/perfil` lo lee y lo ESCRIBE. Con el estado dentro del hook eran dos
// instancias en `/perfil`: dos `GET /driver/availability`, dos suscripciones a
// `onAuthStateChange` y dos listeners de `visibilitychange`.
//
// Y algo peor que la duplicación: al apagar el turno desde `/perfil`, la barra
// de arriba se enteraba SOLO porque su propia instancia recargaba por su cuenta.
// Funcionaba por accidente. Ahora las dos leen el mismo snapshot y el cambio
// llega en el mismo render.
//
// SIGUE SIN ESTADO OPTIMISTA, y sigue siendo deliberado: `POST
// /driver/availability` valida el horario en el servidor y puede rechazar el
// cambio. Encender el interruptor y que rebote medio segundo después es peor que
// el instante de espera — el motorizado se queda creyendo que está disponible
// cuando no lo está. El store NO introduce optimismo.
// ─────────────────────────────────────────────────────────────────────────────

interface Snapshot {
  state: AvailabilityState | null
  loading: boolean
  busy: boolean
  error: string | null
}

const EMPTY: Snapshot = { state: null, loading: true, busy: false, error: null }

let snapshot: Snapshot = EMPTY
const listeners = new Set<() => void>()
let refCount = 0
let authSub: { unsubscribe: () => void } | null = null
let visibilityBound = false
/** Usuario para el que ya se cargó, para no repetir por cada evento de auth. */
let loadedFor: string | null = null

function emit(next: Snapshot): void {
  snapshot = next
  for (const l of listeners) l()
}

async function load(): Promise<void> {
  // En arranque en frío la sesión todavía no está hidratada cuando el store
  // arranca. Sin este guard la request salía sin token, el 401 dejaba `state`
  // en null y la UI pintaba "No disponible" a un motorizado que en la BD SÍ
  // lo está — y el error se quedaba puesto hasta que mandara la app a
  // background y volviera, porque el único reintento era `visibilitychange`.
  //
  // Deliberadamente NO se apaga `loading`: la UI sigue en skeleton, que es
  // "todavía no sé", en vez de afirmar algo falso. El listener de
  // `onAuthStateChange` reintenta en cuanto la sesión aparece.
  if (!(await hasActiveSession())) return

  try {
    const r = await api.get<{ data: AvailabilityState }>('/driver/availability')
    emit({ ...snapshot, state: r.data, error: null, loading: false })
  } catch (err) {
    console.error('[availability] load failed', err)
    // Un fallo de LECTURA no se le enseña al motorizado: no ha pedido nada.
    // Solo los fallos de su propia acción (setAvailable) merecen mensaje.
    emit({ ...snapshot, error: null, loading: false })
  }
}

function onVisibility(): void {
  // Revalidar al volver a primer plano: el cron `close_drivers_outside_schedule`
  // puede haber apagado al motorizado mientras la app estaba en background, y
  // la pantalla seguiría mostrando "disponible" hasta el siguiente toque.
  if (document.visibilityState === 'visible') void load()
}

function start(): void {
  void load()

  // La sesión puede hidratarse (o renovarse, o llegar tras el login) después de
  // arrancar. Este es el reintento que convierte el skeleton en estado real.
  //
  // La clave por usuario evita recargar por cada evento: Supabase emite varios
  // seguidos con la misma sesión (`INITIAL_SESSION` y compañía), y cada uno
  // disparaba un GET idéntico.
  const { data } = getSupabaseBrowser().auth.onAuthStateChange((_event, session) => {
    if (!session) {
      // Sin reset, un logout seguido de login del MISMO motorizado no
      // recargaría: la clave seguiría coincidiendo.
      loadedFor = null
      return
    }
    if (loadedFor === session.user.id) return
    loadedFor = session.user.id
    void load()
  })
  authSub = data.subscription

  document.addEventListener('visibilitychange', onVisibility)
  visibilityBound = true
}

function stop(): void {
  if (authSub !== null) {
    authSub.unsubscribe()
    authSub = null
  }
  if (visibilityBound) {
    document.removeEventListener('visibilitychange', onVisibility)
    visibilityBound = false
  }
}

async function setAvailable(next: boolean): Promise<boolean> {
  if (snapshot.busy) return false
  emit({ ...snapshot, busy: true, error: null })
  try {
    // Aquí el motorizado SÍ pidió algo, así que la falta de sesión se dice
    // en voz alta en vez de fallar con un 401 genérico.
    if (!(await hasActiveSession())) {
      emit({ ...snapshot, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' })
      return false
    }
    await api.post('/driver/availability', { available: next })
    await load()
    return true
  } catch (err) {
    const msg =
      err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo actualizar'
    console.error('[availability] set failed', err)
    emit({ ...snapshot, error: msg })
    // Resincronizar con la verdad del servidor: el rechazo puede venir de
    // que otro camino (cron, otra pestaña) ya cambió el estado.
    await load()
    return false
  } finally {
    emit({ ...snapshot, busy: false })
  }
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

/**
 * Estado de disponibilidad del motorizado, compartido entre /perfil (que lo
 * cambia) y la barra superior (que solo lo lee).
 *
 * Llamarlo N veces NO multiplica peticiones ni listeners.
 */
export function useAvailability() {
  const s = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )

  return {
    available: s.state?.available ?? false,
    withinSchedule: s.state?.withinSchedule ?? false,
    /** No puede activarse porque la plataforma está fuera de horario. */
    blocked: s.state ? !s.state.available && !s.state.withinSchedule : false,
    loading: s.loading,
    busy: s.busy,
    error: s.error,
    setAvailable,
    refresh: load,
  }
}
