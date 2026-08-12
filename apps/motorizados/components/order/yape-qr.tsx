'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { prettyPhone, soles } from '@/lib/format'

/**
 * Tarjeta de QR de Yape del local con temática morada vibrante.
 * Portada de `tindivo-delivery/yape-qr-card.tsx`.
 *
 * Muestra el QR del restaurante para que el cliente lo escanee en la puerta,
 * con opción a pantalla completa y número de cuenta de respaldo.
 */
export function YapeQr({
  qrUrl,
  yapeNumber,
  businessName,
  amount,
}: {
  qrUrl: string | null | undefined
  yapeNumber: string | null | undefined
  businessName?: string | null
  /** Monto a cobrar por Yape si está disponible */
  amount?: number | null
}) {
  const [fullscreen, setFullscreen] = useState(false)

  // Escape cierra, y el fondo deja de hacer scroll debajo del QR.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  if (!qrUrl && !yapeNumber) return null

  const numero = yapeNumber ? prettyPhone(yapeNumber) : null

  return (
    <>
      <section
        className="relative overflow-hidden rounded-[24px] p-5 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #5E00B8 0%, #7B1FA2 60%, #9B27B0 100%)',
          color: '#ffffff',
          boxShadow: '0 16px 40px -12px rgba(94, 0, 184, 0.55)',
        }}
      >
        {/* Resplandor radial de adorno */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 60%)',
          }}
        />

        <div className="relative space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'rgba(255, 255, 255, 0.18)' }}
            >
              <Icon name="qr_code_2" size={22} filled />
            </span>
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white/85">
                Yape al cliente
              </div>
              {amount != null && (
                <div className="font-mono text-lg font-black leading-tight text-white">
                  Cobrar {soles(amount)}
                </div>
              )}
            </div>
          </div>

          {qrUrl ? (
            <>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="block w-full overflow-hidden rounded-2xl bg-white p-3 transition-transform active:scale-[0.98]"
                aria-label="Ver QR en pantalla completa"
              >
                <div className="relative aspect-square w-full">
                  <img
                    src={qrUrl}
                    alt={`QR de Yape de ${businessName ?? 'el local'}`}
                    className="h-full w-full object-contain"
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity active:opacity-80"
                style={{ background: 'rgba(255, 255, 255, 0.18)' }}
              >
                <Icon name="fullscreen" size={18} />
                Ver más grande
              </button>
            </>
          ) : (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ background: 'rgba(255, 255, 255, 0.15)' }}
            >
              <Icon name="info" size={20} className="mx-auto" />
              <p className="mt-2 text-sm font-semibold">Este local no tiene QR cargado.</p>
              {numero && (
                <p className="mt-1 text-xs opacity-90">
                  Cobrar manualmente al número:{' '}
                  <span className="font-mono font-bold">{numero}</span>
                </p>
              )}
            </div>
          )}

          {numero && qrUrl && (
            <div
              className="rounded-lg py-2 text-center text-xs"
              style={{ background: 'rgba(255, 255, 255, 0.12)' }}
            >
              <span className="opacity-85">Nº de cuenta: </span>
              <span className="font-mono font-bold">{numero}</span>
            </div>
          )}
        </div>
      </section>

      {/* Pantalla Completa Modal */}
      {fullscreen && qrUrl && (
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          aria-label="Cerrar el QR"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4"
        >
          {numero && (
            <span
              aria-hidden
              className="absolute top-6 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-white backdrop-blur-md"
              style={{ background: 'rgba(255, 255, 255, 0.16)' }}
            >
              <Icon name="smartphone" size={18} filled />
              <span className="font-mono text-sm font-bold tracking-wide">{numero}</span>
            </span>
          )}

          <img
            src={qrUrl}
            alt={`QR de Yape de ${businessName ?? 'el local'}`}
            className="aspect-square w-full max-w-lg rounded-2xl bg-white object-contain p-4"
          />

          <span
            aria-hidden
            className="absolute top-6 right-6 inline-flex h-12 w-12 items-center justify-center rounded-full text-white"
            style={{ background: 'rgba(255, 255, 255, 0.16)' }}
          >
            <Icon name="close" size={28} />
          </span>
          <span
            aria-hidden
            className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-white/70"
          >
            Toca para cerrar
          </span>
        </button>
      )}
    </>
  )
}
