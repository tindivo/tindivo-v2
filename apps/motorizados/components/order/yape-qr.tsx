'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { prettyPhone } from '@/lib/format'

/**
 * El QR de Yape del local, para que el cliente escanee en la puerta.
 *
 * PORTADO DE `tindivo-delivery/yape-qr-card.tsx`, que lo tenía mejor resuelto.
 * En v2 el QR salía en un recuadro de 150px fijo: sobra para verlo y falta para
 * escanearlo con un móvil ajeno, de noche, con la pantalla sucia y a la
 * distancia a la que dos personas sostienen sus teléfonos.
 *
 * TRES COSAS QUE HACEN QUE SE ESCANEE:
 *
 *   · OCUPA EL ANCHO, en cuadrado. La cámara del cliente necesita módulos
 *     grandes, no una miniatura centrada.
 *   · PANTALLA COMPLETA a un toque, sobre negro. Es lo que salva el caso malo:
 *     poca luz, brillo bajo, o un lector quisquilloso. Se toca en cualquier
 *     parte para cerrar.
 *   · FONDO BLANCO CON MARGEN alrededor. No es estética: un QR sin zona de
 *     silencio no lo lee la mitad de los lectores, y pegarlo a un borde de
 *     color es la forma más común de romperlo.
 *
 * SIN QR NO SE ENSEÑA UN HUECO. Se cae al número, que es con lo que se cobra a
 * mano. Un marco vacío se lee como un fallo de carga y deja al motorizado
 * esperando algo que no va a llegar.
 *
 * NO HAY QR ALTERNATIVO, y en el legacy sí: allí un restaurante podía tener dos
 * por si el principal falla al escanear. `businesses` en v2 solo tiene
 * `qr_url`, así que eso necesitaría columna y pantalla de admin.
 */
export function YapeQr({
  qrUrl,
  yapeNumber,
  businessName,
}: {
  qrUrl: string | null | undefined
  yapeNumber: string | null | undefined
  businessName?: string | null
}) {
  const [fullscreen, setFullscreen] = useState(false)

  // Escape cierra, y el fondo deja de hacer scroll debajo del QR: en móvil, un
  // overlay que se puede arrastrar se siente roto.
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

  if (!qrUrl) {
    return (
      <div className="rounded-[18px] border border-ink/[0.07] bg-card p-4 text-center">
        <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Cóbralo a este número
        </p>
        <p className="mt-1.5 font-mono text-title font-bold tabular-nums text-ink">{numero}</p>
        <p className="mt-1 text-caption text-ink-muted">Este local no tiene QR cargado.</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-[18px] border border-ink/[0.07] bg-card p-3">
        <p className="text-center font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Que escanee este QR
        </p>

        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Ver el QR en pantalla completa"
          className="mt-2 block w-full overflow-hidden rounded-2xl bg-white p-3 transition-transform active:scale-[0.98]"
        >
          <img
            src={qrUrl}
            alt={`QR de Yape de ${businessName ?? 'el local'}`}
            className="aspect-square w-full object-contain"
          />
        </button>

        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-ink/[0.06] py-2.5 text-body font-semibold text-ink"
        >
          <Icon name="fullscreen" size={18} />
          Ver más grande
        </button>

        {numero && (
          <p className="mt-2 text-center text-caption text-ink-muted">
            o al número <span className="font-mono font-semibold text-ink">{numero}</span>
          </p>
        )}
      </div>

      {fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          aria-label="Cerrar el QR"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
        >
          {numero && (
            <span
              aria-hidden
              className="absolute top-6 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white backdrop-blur-sm"
            >
              <Icon name="smartphone" size={18} filled />
              <span className="font-mono text-body font-bold tabular-nums">{numero}</span>
            </span>
          )}

          <img
            src={qrUrl}
            alt={`QR de Yape de ${businessName ?? 'el local'}`}
            className="aspect-square w-full max-w-lg rounded-2xl bg-white object-contain p-4"
          />

          <span
            aria-hidden
            className="absolute top-6 right-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <Icon name="close" size={28} />
          </span>
          <span
            aria-hidden
            className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-meta font-bold uppercase tracking-[0.2em] text-white/70"
          >
            Toca para cerrar
          </span>
        </button>
      )}
    </>
  )
}
