'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { useLatestRequest } from '@/hooks/use-latest-request'
import { ORDER_SELECT } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { HistRow } from './types'

/**
 * LOS PEDIDOS DEL RANGO QUE HAY EN PANTALLA, Y NO LOS DE OTRO.
 *
 * Escribía con la respuesta que llegara, viniera del rango que viniera, y
 * cambiar el rango manda dos peticiones: el selector son dos inputs de fecha,
 * así que elegir «del 3 al 9 de marzo» pide antes «del 3 de marzo al fin
 * viejo». Esa intermedia trae muchas más filas que la buena, así que tarda más
 * y llega después.
 *
 * Aquí eso no es un número torcido en un informe: es la pantalla donde la
 * cajera BUSCA UN PEDIDO por fecha. Con la carrera perdida ve una lista de otra
 * ventana bajo una cabecera que dice el rango que pidió, y desde esa lista abre
 * el detalle. Nada en pantalla le dice que está mirando otra cosa.
 *
 * Es el mismo fallo que tenía `usePerformance`; el porqué entero y por qué el
 * testigo y no un `let vivo`, en `useLatestRequest`.
 */
export function useHistory(startDate: string, endDate: string) {
  const { bizId } = useDashboard()
  const [rows, setRows] = useState<HistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abrirPeticion = useLatestRequest()

  const load = useCallback(async () => {
    if (!bizId) return
    const vigente = abrirPeticion()
    setLoading(true)
    setError(null)

    // Formatear timestamp exacto en hora local de Lima (UTC-5)
    const startIso = `${startDate}T00:00:00-05:00`
    const endIso = `${endDate}T23:59:59-05:00`

    try {
      const { data, error: e } = await getSupabaseBrowser()
        .from('orders')
        .select(ORDER_SELECT)
        .eq('business_id', bizId)
        .in('status', ['delivered', 'cancelled'])
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (!vigente()) return
      if (e) {
        setError(e.message)
      } else {
        setRows((data ?? []) as unknown as HistRow[])
      }
    } catch (err) {
      if (!vigente()) return
      setError(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      // Dentro de la condición: una respuesta vieja apagando el indicador
      // dejaría la lista diciendo «ya está» con la buena todavía en el aire.
      if (vigente()) setLoading(false)
    }
  }, [bizId, startDate, endDate, abrirPeticion])

  useEffect(() => {
    load()
  }, [load])

  return { rows, loading, error, reload: load }
}
