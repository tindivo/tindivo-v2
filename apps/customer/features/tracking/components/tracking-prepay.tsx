'use client'

import { useCallback, useEffect, useState } from 'react'
import { PrepayProofSection } from '@/components/prepay-proof-section'
import type { Tracking } from '@/features/tracking/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface TrackingPrepayProps {
  data: Tracking
  ownedId: string | null
  onProofUploaded: () => void
}

export function TrackingPrepay({ data, ownedId, onProofUploaded }: TrackingPrepayProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(600)
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

  // Temporizador regresivo en validando. Los minutos los decide
  // `app_settings.timers.prepayVerificationMinutes`, que es editable desde el
  // panel admin y viaja en el tracking desde `0170`. El 10 es solo el fallback
  // para una respuesta que aún no lo traiga.
  useEffect(() => {
    if (data.status !== 'validando') return
    const baseTime = data.validatingAt ?? data.createdAt
    if (!baseTime) return

    const startMs = new Date(baseTime).getTime()
    const deadlineMs = startMs + (data.prepayVerificationMinutes ?? 10) * 60 * 1000

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setSeconds(remaining)
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [data.status, data.validatingAt, data.createdAt, data.prepayVerificationMinutes])

  // Cerrar modal con Escape
  useEffect(() => {
    if (!zoomOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomOpen])

  const formatTime = useCallback((sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  if (data.paymentIntent !== 'prepaid') return null

  return (
    <>
      {/* 1. pending_acceptance o validando SIN comprobante: Esperando confirmación */}
      {(data.status === 'pending_acceptance' ||
        (data.status === 'validando' && !data.proofUrl)) && (
        <div className="mt-3.5 rounded-[22px] border border-brand/20 bg-brand-soft p-4 text-left text-brand-dark">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            Esperando confirmación del restaurante
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">
            El restaurante está verificando disponibilidad de tu pedido. Te avisaremos aquí para
            realizar el pago.
          </p>
        </div>
      )}

      {/* 2 & 4. awaiting_payment: Subida de captura (intento 0 o 1) */}
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
            onProofUploaded={onProofUploaded}
          />
        </div>
      )}

      {/* 3. validando CON comprobante subido: En revisión con Countdown y Comprobante agrandable */}
      {data.status === 'validando' && Boolean(data.proofUrl) && (
        <div className="mt-3.5 rounded-[22px] border border-sky-200 bg-sky-50/70 p-4 text-left text-sky-900 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-sky-900">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-600" />
              </span>
              Verificando tu pago...
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-mono text-[12px] font-bold text-sky-800 shadow-xs border border-sky-200">
              <svg
                className="h-3.5 w-3.5 text-sky-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label="Temporizador"
              >
                <title>Temporizador</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {formatTime(seconds)}
            </span>
          </div>

          <p className="mt-2 text-[13px] leading-relaxed text-sky-800/90">
            El restaurante está revisando tu comprobante de pago. Te notificaremos apenas sea
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
