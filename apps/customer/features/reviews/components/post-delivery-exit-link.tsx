'use client'

import { BottomSheet } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import { Stars } from '@/features/reviews/components/stars'
import {
  dismissReview,
  fetchPendingReview,
  type PendingReview,
  submitReview,
} from '@/features/reviews/lib/pending'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface PostDeliveryExitLinkProps {
  /** El pedido de ESTA pantalla, ya entregado. */
  shortId: string
}

type Estado = 'idle' | 'buscando' | 'preguntar'

/**
 * «Volver al inicio», con una parada antes si el pedido que se acaba de
 * entregar es justo el que toca calificar.
 *
 * CONSULTA FRESCA EN EL CLIC, no el hook compartido (`usePendingReview`). Ese
 * hook pregunta una sola vez y se queda con esa respuesta —para no repreguntar
 * en cada render—, así que si esta pantalla ya lo usó para pintar la tarjeta
 * del pedido ANTERIOR mientras esperaba, seguiría devolviendo ese pedido viejo
 * y nunca el que se acaba de entregar. Preguntar de nuevo aquí, en el momento
 * exacto del clic, es lo único que garantiza comparar contra el pedido
 * correcto.
 *
 * SE COMPARA POR `shortId`, no por el id interno: es lo único que esta
 * pantalla conoce del pedido (`Tracking` no carga el uuid), y es la forma en
 * que el resto de la app ya identifica pedidos de cara al cliente.
 *
 * LA SALIDA NUNCA SE BLOQUEA. Falle la consulta, falle el envío, o ya lo haya
 * calificado desde otra pestaña: siempre se navega. La reseña es un extra, no
 * un peaje para volver al inicio.
 */
export function PostDeliveryExitLink({ shortId }: PostDeliveryExitLinkProps) {
  const router = useRouter()
  const vivo = useRef(true)
  // Resetea a `true` al MONTAR, no solo al declarar el ref: en desarrollo,
  // React monta → desmonta → vuelve a montar cada componente una vez (Strict
  // Mode), y ese primer desmontaje deja `vivo.current` en `false` para
  // siempre si el efecto no lo repone aquí. Sin esto, todo clic fallaba en
  // desarrollo -ni abría la pregunta ni navegaba- porque `onClick` encontraba
  // `vivo.current` ya apagado cuando volvía la RPC.
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const [estado, setEstado] = useState<Estado>('idle')
  const [pendiente, setPendiente] = useState<PendingReview | null>(null)
  const [nota, setNota] = useState(0)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const irAlInicio = () => router.push('/')

  const onClick = async () => {
    // Ya se está resolviendo, o ya se abrió la pregunta: un segundo clic no
    // vuelve a preguntar por encima.
    if (estado !== 'idle') return
    setEstado('buscando')
    try {
      const p = await fetchPendingReview()
      if (!vivo.current) return
      if (p && p.shortId === shortId) {
        setPendiente(p)
        setEstado('preguntar')
        return
      }
    } catch {
      // Un fallo aquí no puede impedir volver al inicio.
    }
    if (vivo.current) irAlInicio()
  }

  const elegir = (n: number) => {
    setNota(n)
    setDetalleAbierto(true)
  }

  const descartar = async () => {
    // El userId se pide aquí y no en el clic inicial: es la ÚNICA rama que lo
    // necesita, y pedirlo antes retrasaría con una consulta de más el camino
    // que SÍ ve todo el mundo (ver el prompt).
    if (pendiente) {
      try {
        const { data } = await getSupabaseBrowser().auth.getSession()
        const userId = data.session?.user.id
        if (userId) await dismissReview(pendiente.orderId, userId)
      } catch {
        // La pregunta volverá a aparecer más adelante; no hay nada que decirle.
      }
    }
    irAlInicio()
  }

  const enviar = async (rating: number, tags: string[], comment: string): Promise<boolean> => {
    if (!pendiente) return false
    setEnviando(true)
    setError(null)
    try {
      await submitReview({ orderId: pendiente.orderId, rating, tags, comment })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar. Inténtalo de nuevo.')
      return false
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        className="mt-6 inline-block text-[14px] text-brand"
      >
        ← Volver al inicio
      </button>

      {pendiente && estado === 'preguntar' && !detalleAbierto && (
        <BottomSheet
          open
          onClose={irAlInicio}
          label={`¿Cómo estuvo tu pedido de ${pendiente.businessName}?`}
        >
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6">
            <div className="flex items-center gap-3">
              {pendiente.businessLogoUrl ? (
                <img
                  src={pendiente.businessLogoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-[14px] object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-low font-display font-bold text-[24px] text-ink-muted leading-none">
                  {pendiente.businessName.charAt(0)}
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-display font-bold text-lead leading-tight tracking-tight">
                  ¿Cómo estuvo tu pedido?
                </p>
                <p className="truncate text-label text-ink-muted leading-relaxed">
                  {pendiente.businessName} · tu nota le llega directo al negocio
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Stars value={nota} onChange={elegir} />
              <button
                type="button"
                onClick={() => void descartar()}
                className="shrink-0 font-medium text-ink-muted text-label underline-offset-2 hover:underline"
              >
                Ahora no
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {pendiente && (
        <ReviewSheet
          open={detalleAbierto}
          pendiente={pendiente}
          notaInicial={nota === 0 ? 5 : nota}
          enviando={enviando}
          error={error}
          onClose={irAlInicio}
          onSubmit={enviar}
        />
      )}
    </>
  )
}
