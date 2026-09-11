'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dismissReview,
  fetchPendingReview,
  type PendingReview,
  type SubmitReviewInput,
  submitReview,
} from '@/features/reviews/lib/pending'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface PendingReviewState {
  pendiente: PendingReview | null
  enviando: boolean
  error: string | null
  enviar: (rating: number, tags: string[], comment: string) => Promise<boolean>
  descartar: () => Promise<void>
}

/**
 * El pendiente de calificar del cliente, y las dos salidas de la tarjeta.
 *
 * SE CONSULTA UNA VEZ Y NO SE REPITE. `get_pending_review` devuelve `null` en la
 * inmensa mayoría de las cargas, y volver a preguntar en cada render o en cada
 * cambio de estado del pedido sería gastar idas para no pintar nada.
 *
 * NO SE PREGUNTA SIN SESIÓN. La RPC ya devuelve `null` para `anon`, pero el
 * enlace del seguimiento se comparte y lo abre gente sin cuenta: sin esta
 * guarda, cada vecino que abre el enlace de otro dispara una llamada inútil.
 *
 * LAS DOS SALIDAS DEJAN LA TARJETA CERRADA. Enviar y descartar hacen lo mismo
 * de cara a esta sesión —`setPendiente(null)`—, pero por debajo son distintas:
 * la reseña ya no aparece nunca, el descarte solo apaga la PREGUNTA y el
 * cliente todavía puede calificar entrando desde su historial.
 */
export function usePendingReview(activo: boolean): PendingReviewState {
  const [pendiente, setPendiente] = useState<PendingReview | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * El pestillo de «ya preguntamos» va en un `ref`, no en el estado.
   *
   * Con `useState` habría que ponerlo en las dependencias del efecto, y
   * escribirlo DENTRO del efecto dispara su propia limpieza antes de que vuelva
   * la RPC: el `vivo = false` llega primero y el resultado se descarta siempre.
   * La tarjeta no aparecía nunca y la RPC respondía bien — el fallo no dejaba
   * rastro por ningún lado.
   */
  const consultado = useRef(false)

  useEffect(() => {
    if (!activo || consultado.current) return
    let vivo = true
    consultado.current = true
    void (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession()
      const uid = data.session?.user.id ?? null
      if (!vivo) return
      setUserId(uid)
      if (!uid) return
      try {
        const p = await fetchPendingReview()
        if (vivo) setPendiente(p)
      } catch {
        // Un fallo aquí no puede romper la pantalla en la que vive la tarjeta:
        // el seguimiento del pedido de HOY importa más que la pregunta por el
        // de ayer. Se queda sin pendiente y se vuelve a intentar en la
        // siguiente carga.
      }
    })()
    return () => {
      vivo = false
    }
  }, [activo])

  const enviar = useCallback(
    async (rating: number, tags: string[], comment: string): Promise<boolean> => {
      if (!pendiente || enviando) return false
      setEnviando(true)
      setError(null)
      const input: SubmitReviewInput = { orderId: pendiente.orderId, rating, tags, comment }
      try {
        await submitReview(input)
        setPendiente(null)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo enviar. Inténtalo de nuevo.')
        return false
      } finally {
        setEnviando(false)
      }
    },
    [pendiente, enviando],
  )

  const descartar = useCallback(async () => {
    if (!pendiente || !userId) return
    // Se cierra la tarjeta ANTES de esperar a la base. El cliente ya dijo que no
    // quiere verla; dejársela puesta medio segundo más mientras viaja un INSERT
    // es cobrarle la latencia por rechazar. Si el INSERT falla, lo peor que pasa
    // es que la pregunta reaparezca en la siguiente carga.
    const orderId = pendiente.orderId
    setPendiente(null)
    try {
      await dismissReview(orderId, userId)
    } catch {
      /* la pregunta volverá a aparecer; no hay nada que decirle al cliente */
    }
  }, [pendiente, userId])

  return { pendiente, enviando, error, enviar, descartar }
}
