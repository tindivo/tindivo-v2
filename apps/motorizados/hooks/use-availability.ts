'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type AvailabilityState = {
  available: boolean
  withinSchedule: boolean
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

  const load = useCallback(async () => {
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
