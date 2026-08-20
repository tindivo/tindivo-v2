'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { PrepayProofSection } from '@/components/prepay-proof-section'
import { CountdownPill } from '@/features/tracking/components/tracking-countdown'
import type { CountdownView } from '@/features/tracking/lib/deadline'
import type { Tracking } from '@/features/tracking/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface TrackingPrepayProps {
  data: Tracking
  ownedId: string | null
  /**
   * El plazo activo, calculado una sola vez en la página. Antes este componente
   * montaba su propio `setInterval` de un segundo con el deadline escrito a
   * mano; ahora los tres relojes salen de `activeDeadline` y solo late uno.
   */
  countdown: CountdownView | null
  onProofUploaded: () => void
}

export function TrackingPrepay({ data, ownedId, countdown, onProofUploaded }: TrackingPrepayProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)

  // Obtener URL firmada del comprobante para visualización
  useEffect(() => {
    const raw = data.proofUrl
    if (!raw) {
      setSignedUrl(null)
      return
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      setSignedUrl(raw)
      return
    }
    let cancelled = false
    getSupabaseBrowser()
      .storage.from('payment-proofs')
      .createSignedUrl(raw, 3600)
      .then(({ data: res }) => {
        if (!cancelled && res?.signedUrl) {
          setSignedUrl(res.signedUrl)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [data.proofUrl])

  // Cerrar modal con Escape
  useEffect(() => {
    if (!zoomOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomOpen])

  if (data.paymentIntent !== 'prepaid') return null

  const minutosParaPagar = data.paymentMinutes ?? 15

  return (
    <>
      {/* 1. pending_acceptance o validando SIN comprobante: qué viene después.
          El «estamos confirmando» y su contador ya están en la fila de cancelar,
          justo encima; repetirlos aquí solo alargaba la pantalla. Lo que esta
          tarjeta aporta es lo único que el cliente todavía no sabe: que en
          cuanto le confirmen le empieza a correr un plazo para pagar. */}
      {(data.status === 'pending_acceptance' ||
        (data.status === 'validando' && !data.proofUrl)) && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-[22px] border border-brand/20 bg-brand-soft p-4 text-left">
          <Icon name="account_balance_wallet" size={20} className="mt-px shrink-0 text-brand" />
          <div>
            <div className="text-[14px] font-semibold text-brand-dark">Ten tu Yape a la mano</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Cuando el restaurante confirme que tiene tu pedido, te avisaremos aquí y tendrás{' '}
              <strong>{minutosParaPagar} minutos</strong> para pagar y subir tu captura.
            </p>
          </div>
        </div>
      )}

      {/* 2 & 4. awaiting_payment: subida de captura.
          El reloj NO se pinta aquí sino dentro de `PrepayProofSection`, que ya
          tenía el suyo arriba del todo. Enseñar dos contadores del mismo plazo,
          uno encima del otro, no es el doble de aviso: es el cliente
          preguntándose cuál de los dos es el bueno. */}
      {data.status === 'awaiting_payment' && (
        <div>
          {data.proofAttempt === 1 && (
            <div className="mt-3.5 rounded-[18px] border border-danger/20 bg-danger-soft p-3.5 text-left text-[13px] text-danger">
              <strong>Tu comprobante no fue válido.</strong> Revisa e intenta de nuevo. Te queda 1
              intento.
            </div>
          )}
          <PrepayProofSection
            orderId={ownedId ?? data.shortId}
            proofAttempt={data.proofAttempt ?? 0}
            countdown={
              countdown
                ? {
                    label: countdown.label,
                    urgent: countdown.kind === 'running' && countdown.urgent,
                  }
                : null
            }
            onProofUploaded={onProofUploaded}
          />
        </div>
      )}

      {/* 3. validando CON comprobante subido: en revisión, con contador y con la
          captura ampliable. */}
      {data.status === 'validando' && Boolean(data.proofUrl) && (
        <div className="mt-3.5 rounded-[22px] border border-sky-200 bg-sky-50/70 p-4 text-left text-sky-900 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-sky-900">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-600" />
              </span>
              Verificando tu pago…
            </div>
            {countdown && <CountdownPill view={countdown} />}
          </div>

          <p className="mt-2 text-[13px] leading-relaxed text-sky-800/90">
            El restaurante está revisando tu comprobante de pago. Te avisamos aquí apenas quede
            verificado.
          </p>

          {/* Miniatura del comprobante con botón para agrandar */}
          {signedUrl && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between pb-1.5 text-[11px] font-medium text-sky-800">
                <span>Comprobante enviado</span>
                <span className="text-[11px] font-semibold text-sky-700">
                  Toca para agrandar 🔍
                </span>
              </div>
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="group relative block w-full overflow-hidden rounded-xl border border-sky-200 bg-white transition-all hover:border-sky-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <img
                  src={signedUrl}
                  alt="Comprobante de pago"
                  className="max-h-40 w-full object-contain p-2 transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-full bg-black/70 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-xs">
                    Ver en pantalla completa
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Lightbox para ver el comprobante en grande */}
      {zoomOpen && signedUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprobante de pago ampliado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            className="fixed inset-0 h-full w-full cursor-default bg-transparent border-0"
            onClick={() => setZoomOpen(false)}
            aria-label="Cerrar modal"
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-[95vw] flex-col items-center justify-center pointer-events-auto">
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              className="absolute -top-12 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-[18px] font-bold text-white transition-colors hover:bg-white/40 focus:outline-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <img
              src={signedUrl}
              alt="Comprobante de pago ampliado"
              className="max-h-[85vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
            />
            <div className="mt-3 flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1 text-[12px] font-medium text-white/90">
              <span>Comprobante de pago</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="underline hover:text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
