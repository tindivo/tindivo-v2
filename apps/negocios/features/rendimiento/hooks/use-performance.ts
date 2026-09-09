'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import type { PerformancePayload } from '@tindivo/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export type PerformanceData = PerformancePayload & { businessName: string }

/**
 * LAS MÉTRICAS DEL RANGO QUE HAY EN PANTALLA, Y NO LAS DE OTRO.
 *
 * Cambiar el rango dispara varias peticiones —el selector es un par de
 * `<input type="date">`, así que elegir «del 3 al 9 de marzo» manda primero
 * «del 3 de marzo al fin viejo» y después la buena— y esta función escribía con
 * la que llegara, viniera del rango que viniera. GANABA LA ÚLTIMA EN RESPONDER,
 * NO LA ÚLTIMA EN PEDIRSE.
 *
 * Y no es una carrera teórica: la intermedia suele ser MUCHO más pesada que la
 * buena (si vienes de «últimos 7 días» y eliges enero de 2025, es enero-2025 →
 * ayer, más de un año de agregación), así que tarda más y llega después.
 * Medido en el navegador, con las cuatro peticiones que hace una edición de
 * rango en dev:
 *
 *   pedidas:     por-defecto · por-defecto · intermedia · LA BUENA
 *   respondidas: por-defecto · intermedia  · LA BUENA   · por-defecto
 *
 * El resultado es la peor forma de estar mal: la cabecera, la etiqueta del
 * rango y los dos inputs dicen marzo de 2025, y los números son de otra
 * ventana. No hay nada en pantalla que delate el error, y esta es la pantalla
 * con la que el dueño decide.
 *
 * La guarda es un contador de peticiones: cada llamada se queda con su número y
 * solo escribe si sigue siendo la más nueva. `loading` va dentro de la misma
 * condición a propósito — una respuesta vieja apagando el indicador dejaría la
 * pantalla diciendo «ya está» con la buena todavía en el aire.
 *
 * NO SE TOCA EL SELECTOR, aunque sea quien dispara la intermedia: cambiar solo
 * la fecha de inicio ES un rango nuevo y legítimo (alguien puede querer
 * exactamente eso y parar ahí), y `DateRangePicker` lo comparten Historial y
 * Reseñas. Lo que estaba roto era quién gana, no que se pidiera.
 */
export function usePerformance(start: string, end: string) {
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ultimaPeticion = useRef(0)

  const load = useCallback(async () => {
    const mia = ++ultimaPeticion.current
    const vigente = () => mia === ultimaPeticion.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start, end })
      const res = await api.get<ApiEnvelope<PerformanceData>>(
        `/business/reports/rendimiento?${params.toString()}`,
      )
      if (!vigente()) return
      setData(res.data)
    } catch (err) {
      if (!vigente()) return
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudieron cargar las métricas',
      )
    } finally {
      if (vigente()) setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
