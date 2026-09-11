'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface ReviewRow {
  id: string
  rating: number
  tags: string[]
  createdAt: string
  /** El pedido, para que la cajera pueda ubicar la noche. */
  shortId: string | null
  deliveredAt: string | null
}

/**
 * Las reseñas una a una, no agregadas.
 *
 * ES LA PREGUNTA QUE EL RESUMEN NO CONTESTA. Un promedio dice «vas a 4.0»; una
 * lista dice CUÁL fue el 2, y eso es lo accionable — la cajera se acuerda de esa
 * noche en cuanto ve el número de pedido y la hora.
 *
 * SE ENSEÑA EL PEDIDO, NO EL CLIENTE. El nombre y el teléfono están a un clic
 * en el historial, así que esto no esconde nada que ella no pueda averiguar;
 * pero ponerle el nombre AL LADO de una queja es invitar a la llamada, y esa
 * llamada es exactamente lo que hace que la próxima persona no escriba nada.
 * El número de pedido le da el diagnóstico sin ponerle la cara delante.
 *
 * El `comment` no se pide porque el GRANT por columna de la 0217 no lo permite:
 * pedirlo haría fallar la consulta entera.
 */
export function useReviewsList(start: string, end: string) {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    void (async () => {
      const { data, error } = await getSupabaseBrowser()
        .from('order_reviews')
        // El embed de `orders` lo gobierna `ord_business_read`: si el pedido no
        // fuera del negocio, llegaría en null en vez de filtrarse la fila.
        .select('id, rating, tags, created_at, orders(short_id, delivered_at)')
        .gte('created_at', `${start}T00:00:00.000Z`)
        .lte('created_at', `${end}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!vivo) return

      if (error || !data) {
        setRows([])
        setLoading(false)
        return
      }

      setRows(
        data.map((fila) => {
          const pedido = fila.orders as { short_id: string; delivered_at: string | null } | null
          return {
            id: fila.id,
            rating: Number(fila.rating),
            tags: fila.tags ?? [],
            createdAt: fila.created_at,
            shortId: pedido?.short_id ?? null,
            deliveredAt: pedido?.delivered_at ?? null,
          }
        }),
      )
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [start, end])

  return { rows, loading }
}
