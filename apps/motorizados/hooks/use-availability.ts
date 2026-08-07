'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * Estado de disponibilidad del motorizado, compartido entre /perfil (que lo
 * cambia) y la home (que solo lo lee).
 *
 * SIN estado optimista a propósito: `POST /driver/availability` valida el
 * horario en el servidor y puede rechazar el cambio. Encender el switch y que
 * rebote medio segundo después es peor que el instante de espera — el
 * motorizado se queda creyendo que está disponible cuando no lo está.
 */
export function useAvailability() {
  const [state, setState] = useState<AvailabilityState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Id del usuario para el que ya se cargó, y así no repetir por cada evento. */
  const loadedForRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    // En arranque en frío la sesión todavía no está hidratada cuando el hook
    // monta. Sin este guard la request salía sin token, el 401 dejaba `state`
    // en null y la UI pintaba "No disponible" a un motorizado que en la BD SÍ
    // lo está — y el error se quedaba puesto hasta que mandara la app a
    // background y volviera, porque el único reintento era `visibilitychange`.
    //
    // Deliberadamente NO se apaga `loading`: la UI sigue en skeleton, que es
    // "todavía no sé", en vez de afirmar algo falso. El efecto de
    // `onAuthStateChange` reintenta en cuanto la sesión aparece.
    if (!(await hasActiveSession())) return

    try {
      const r = await api.get<{ data: AvailabilityState }>('/driver/availability')
      setState(r.data)
      setError(null)
    } catch (err) {
      console.error('[availability] load failed', err)
      // Un fallo de LECTURA no se le enseña al motorizado: no ha pedido nada.
      // Solo los fallos de su propia acción (setAvailable) merecen mensaje.
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // La sesión puede hidratarse (o renovarse, o llegar tras el login) después de
  // montar. Este es el reintento que convierte el skeleton en estado real.
  //
  // El ref evita recargar por cada evento: Supabase emite varios seguidos con
  // la misma sesión (`INITIAL_SESSION` y compañía), y cada uno disparaba un GET
  // idéntico. Se recuerda para QUÉ usuario ya se cargó y se ignora el resto.
  useEffect(() => {
    const { data } = getSupabaseBrowser().auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // Sin reset, un logout seguido de login del MISMO motorizado no
        // recargaría: la clave seguiría coincidiendo.
        loadedForRef.current = null
        return
      }
      const key = session.user.id
      if (loadedForRef.current === key) return
      loadedForRef.current = key
      void load()
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  // Revalidar al volver a primer plano: el cron `close_drivers_outside_schedule`
  // puede haber apagado al motorizado mientras la app estaba en background, y
  // la pantalla seguiría mostrando "disponible" hasta el siguiente toque.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [load])

  const setAvailable = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (busy) return false
      setBusy(true)
      setError(null)
      try {
        // Aquí el motorizado SÍ pidió algo, así que la falta de sesión se dice
        // en voz alta en vez de fallar con un 401 genérico.
        if (!(await hasActiveSession())) {
          setError('Tu sesión expiró. Vuelve a iniciar sesión.')
          return false
        }
        await api.post('/driver/availability', { available: next })
        await load()
        return true
      } catch (err) {
        const msg =
          err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo actualizar'
        setError(msg)
        console.error('[availability] set failed', err)
        // Resincronizar con la verdad del servidor: el rechazo puede venir de
        // que otro camino (cron, otra pestaña) ya cambió el estado.
        await load()
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, load],
  )

  return {
    available: state?.available ?? false,
    withinSchedule: state?.withinSchedule ?? false,
    /** No puede activarse porque la plataforma está fuera de horario. */
    blocked: state ? !state.available && !state.withinSchedule : false,
    loading,
    busy,
    error,
    setAvailable,
    refresh: load,
  }
}
