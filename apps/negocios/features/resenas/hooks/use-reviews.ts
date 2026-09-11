'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface ReviewsSummary {
  total: number
  promedio: number
  /** Cuántas reseñas por nota, de 1 a 5. Índice 0 = una estrella. */
  reparto: [number, number, number, number, number]
  /** Etiquetas más repetidas primero, ya con su nombre. */
  etiquetas: { id: string; label: string; veces: number }[]
}

/**
 * Las reseñas del periodo, para el dueño.
 *
 * SE LEE DIRECTO POR RLS, no por la API. `order_reviews_business_read` ya acota
 * las filas a las del negocio, así que meter esto por `apps/api` solo añadiría
 * los 470-750 ms de piso del salto sin comprobar nada nuevo.
 *
 * Y LA COLUMNA `comment` NO SE PIDE PORQUE NO SE PUEDE PEDIR. El GRANT por
 * columna de la 0217 la deja fuera del rol `authenticated`: si alguien
 * escribiera `comment` en este `select`, la consulta FALLARÍA. La promesa que
 * la app del cliente le hace al vecino —«lo que escribas lo lee solo el equipo
 * de Tindivo»— la sostiene la base, no la lista de campos de aquí.
 */
export function useReviews(start: string, end: string) {
  const [data, setData] = useState<ReviewsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    void (async () => {
      // `end` es un día, no un instante: se pide hasta el final de esa jornada.
      const hasta = `${end}T23:59:59.999Z`
      const supabase = getSupabaseBrowser()
      // Las dos consultas no dependen entre sí. El catálogo de nombres sale de
      // `app_settings.reviews`, legible desde la lista blanca de la 0218: en
      // `tags` solo hay ids, y un panel que enseñe `llego_fria` en crudo no
      // sirve de nada.
      const [reviews, settings] = await Promise.all([
        supabase
          .from('order_reviews')
          .select('rating, tags')
          .gte('created_at', `${start}T00:00:00.000Z`)
          .lte('created_at', hasta),
        supabase.from('app_settings').select('value').eq('key', 'reviews').maybeSingle(),
      ])
      if (!vivo) return
      const { data: filas, error } = reviews
      const catalogo = new Map(
        (
          ((settings.data?.value as { tags?: { id: string; label: string }[] } | null)?.tags ??
            []) as { id: string; label: string }[]
        ).map((t) => [t.id, t.label]),
      )

      if (error || !filas) {
        // Sin reseñas y sin ruido: el panel de rendimiento no puede romperse
        // porque falle su sección más nueva.
        setData({ total: 0, promedio: 0, reparto: [0, 0, 0, 0, 0], etiquetas: [] })
        setLoading(false)
        return
      }

      const reparto: [number, number, number, number, number] = [0, 0, 0, 0, 0]
      const cuenta = new Map<string, number>()
      let suma = 0
      for (const fila of filas) {
        const nota = Number(fila.rating)
        suma += nota
        // El `?? 0` no es paranoia: con índice variable, TS ensancha el acceso
        // a la tupla a `number | undefined` aunque el rango ya esté acotado.
        const idx = nota - 1
        if (idx >= 0 && idx < 5) reparto[idx] = (reparto[idx] ?? 0) + 1
        for (const tag of fila.tags ?? []) cuenta.set(tag, (cuenta.get(tag) ?? 0) + 1)
      }

      setData({
        total: filas.length,
        promedio: filas.length > 0 ? suma / filas.length : 0,
        reparto,
        etiquetas: [...cuenta.entries()]
          // Una etiqueta retirada del catálogo sigue viva en reseñas antiguas.
          // Se enseña su id antes que esconder la fila: el conteo tiene que
          // cuadrar con el total aunque alguien haya editado el catálogo.
          .map(([id, veces]) => ({ id, label: catalogo.get(id) ?? id, veces }))
          .sort((a, b) => b.veces - a.veces),
      })
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [start, end])

  return { data, loading }
}
