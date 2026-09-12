'use client'

import { BottomSheet } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import { Stars } from '@/features/reviews/components/stars'
import {
  dismissReview,
  fetchPendingReview,
  type PendingReview,
  submitReview,
} from '@/features/reviews/lib/pending'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * El mismo respiro que `usePushOffer`: deja que el cliente registre el
 * «entregado» en pantalla antes de taparlo con una hoja. Un popup en el
 * primer frame de un estado que acaba de cambiar se descarta por reflejo.
 */
const RETARDO_MS = 1200

interface PostDeliveryExitLinkProps {
  /** El pedido de ESTA pantalla, ya entregado. */
  shortId: string
  /**
   * Hay otra hoja modal disputando la pantalla (la del permiso de avisos, que
   * puede quedar abierta sin contestar justo cuando el pedido pasa a
   * `delivered`). El popup espera: dos hojas seguidas se descartan las dos
   * por reflejo, y `pendiente` no se pierde mientras tanto.
   */
  holdOpen?: boolean
}

/**
 * El popup de reseña, y «Volver al inicio» debajo.
 *
 * SE ABRE SOLO, al llegar a `delivered` — no espera a que el cliente toque
 * «Volver al inicio». Es el patrón de Rappi/Uber Eats: la pregunta aparece en
 * el momento en que el pedido se cierra, mientras el cliente todavía tiene la
 * pantalla del pedido delante. Antes solo se consultaba EN el clic de ese
 * enlace, así que quien cerraba la pestaña o volvía por otro camino (el
 * historial, un enlace compartido) nunca la veía — y quien sí tocaba el
 * enlace, la veía DESPUÉS de decidir que ya se iba, el peor momento para
 * pedirle algo más.
 *
 * SE COMPARA POR `shortId`, no por el id interno: es lo único que esta
 * pantalla conoce del pedido (`Tracking` no carga el uuid), y es la forma en
 * que el resto de la app ya identifica pedidos de cara al cliente. Sin este
 * cotejo, un cliente que ya pidió de nuevo y vuelve a mirar ESTE pedido viejo
 * vería el popup de un pedido que ya no es el más reciente sin calificar.
 *
 * CERRAR EL POPUP NO SACA DE LA PANTALLA. Tocar fuera, la X o «Ahora no» son
 * la misma respuesta —«ahora no»— y solo escriben el descarte; quien lo cierra
 * se queda viendo el detalle de su pedido, que es lo que estaba mirando. Irse
 * de verdad es cosa del enlace de abajo, que nunca espera a la reseña: la
 * reseña es un extra, no un peaje para volver al inicio.
 */
export function PostDeliveryExitLink({ shortId, holdOpen = false }: PostDeliveryExitLinkProps) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState<PendingReview | null>(null)
  const [popupAbierto, setPopupAbierto] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [nota, setNota] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    fetchPendingReview()
      .then((p) => {
        if (!vivo || !p || p.shortId !== shortId) return
        setPendiente(p)
        espera = setTimeout(() => {
          if (vivo) setPopupAbierto(true)
        }, RETARDO_MS)
      })
      .catch(() => {
        // Sin pendiente no hay popup; el pedido ya quedó entregado igual.
      })
    return () => {
      vivo = false
      if (espera) clearTimeout(espera)
    }
  }, [shortId])

  const irAlInicio = () => router.push('/')

  const elegir = (n: number) => {
    setNota(n)
    setDetalleAbierto(true)
  }

  const descartar = async () => {
    setPopupAbierto(false)
    if (!pendiente) return
    try {
      const { data } = await getSupabaseBrowser().auth.getSession()
      const userId = data.session?.user.id
      if (userId) await dismissReview(pendiente.orderId, userId)
    } catch {
      // La pregunta volverá a aparecer más adelante; no hay nada que decirle.
    }
  }

  const enviar = async (rating: number, tags: string[], comment: string): Promise<boolean> => {
    if (!pendiente) return false
    setEnviando(true)
    setError(null)
    try {
      await submitReview({ orderId: pendiente.orderId, rating, tags, comment })
      // Ya calificado: que el popup no vuelva a asomar cuando `ReviewSheet`
      // se cierre y `detalleAbierto` vuelva a `false`.
      setPopupAbierto(false)
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
        onClick={irAlInicio}
        className="mt-6 inline-block text-[14px] text-brand"
      >
        ← Volver al inicio
      </button>

      {pendiente && (
        <>
          <BottomSheet
            open={popupAbierto && !detalleAbierto && !holdOpen}
            onClose={() => void descartar()}
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

          <ReviewSheet
            open={detalleAbierto}
            pendiente={pendiente}
            notaInicial={nota === 0 ? 5 : nota}
            enviando={enviando}
            error={error}
            onClose={() => setDetalleAbierto(false)}
            onSubmit={enviar}
          />
        </>
      )}
    </>
  )
}
