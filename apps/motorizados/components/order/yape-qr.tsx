'use client'

import { type PaymentQrView, walletLabel } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { prettyPhone, soles } from '@/lib/format'

/**
 * Tarjeta de cobro digital del local con temática morada vibrante.
 * Portada de `tindivo-delivery/yape-qr-card.tsx`.
 *
 * Muestra el QR del restaurante para que el cliente escanee en la puerta, con
 * opción a pantalla completa y el número de la cuenta como respaldo.
 *
 * DOS QR (0184). El local puede tener un segundo método de cobro, y aquí es
 * donde importa: el QR impreso se moja, se raya o se subió mal escaneado, y en
 * la puerta del cliente no hay segunda oportunidad. Con las pestañas el
 * motorizado salta al de repuesto en un toque en vez de ponerse a dictar nueve
 * dígitos. Cada método dice su billetera y su titular porque no tienen por qué
 * ser la misma cuenta: el cliente abre Yape o Plin según lo que diga la
 * pestaña, y confirma contra el nombre antes de transferir.
 */
export function YapeQr({
  qrs,
  fallbackNumber,
  businessName,
  amount,
}: {
  /** Métodos de cobro del local, principal primero. */
  qrs: PaymentQrView[] | null | undefined
  /** Número suelto del negocio, para locales que aún no dieron de alta ninguno. */
  fallbackNumber?: string | null
  businessName?: string | null
  /** Monto a cobrar por Yape si está disponible */
  amount?: number | null
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [active, setActive] = useState(0)

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

  const methods = qrs ?? []
  // El índice se queda quieto mientras el pedido se refresca; si el local borra
  // un método por detrás, esto evita quedarse apuntando a un hueco.
  const current = methods[active] ?? methods[0] ?? null

  if (methods.length === 0 && !fallbackNumber) return null

  const numero = current
    ? prettyPhone(current.accountNumber)
    : fallbackNumber
      ? prettyPhone(fallbackNumber)
      : null
  const qrUrl = current?.qrUrl ?? null
  const marca = current ? walletLabel(current.wallet) : 'Yape'

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
                {marca} al cliente
              </div>
              {amount != null && (
                <div className="font-mono text-lg font-black leading-tight text-white">
                  Cobrar {soles(amount)}
                </div>
              )}
            </div>
          </div>

          {/* Pestañas: solo cuando hay de verdad dónde elegir. */}
          {methods.length > 1 && (
            <div
              className="flex gap-1 rounded-xl p-1"
              style={{ background: 'rgba(0, 0, 0, 0.18)' }}
            >
              {methods.map((m, i) => (
                <button
                  key={m.slot}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={i === active}
                  className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
                    i === active ? 'text-[#5E00B8]' : 'text-white/80'
                  }`}
                  style={{ background: i === active ? '#ffffff' : 'transparent' }}
                >
                  {tabLabel(m, methods)}
                </button>
              ))}
            </div>
          )}

          {qrUrl ? (
            <>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="block w-full overflow-hidden rounded-2xl bg-white p-3 transition-transform active:scale-[0.98]"
                aria-label={`Ver QR de ${marca} en pantalla completa`}
              >
                <div className="relative aspect-square w-full">
                  <img
                    src={qrUrl}
                    alt={`QR de ${marca} de ${businessName ?? 'el local'}`}
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
              <p className="mt-2 text-sm font-semibold">
                {methods.length > 0
                  ? `Este método no tiene QR: cóbralo por ${marca}.`
                  : 'Este local no tiene QR cargado.'}
              </p>
              {numero && (
                <p className="mt-1 text-xs opacity-90">
                  Cobrar manualmente al número:{' '}
                  <span className="font-mono font-bold">{numero}</span>
                </p>
              )}
            </div>
          )}

          {/* La cuenta a la que se transfiere. El nombre del titular es lo que
              Yape y Plin enseñan al confirmar: sin él, el cliente no puede
              comprobar que le está pagando a quien debe. */}
          {numero && qrUrl && (
            <div
              className="rounded-lg px-3 py-2 text-center text-xs"
              style={{ background: 'rgba(255, 255, 255, 0.12)' }}
            >
              <div>
                <span className="opacity-85">Nº de cuenta: </span>
                <span className="font-mono font-bold">{numero}</span>
              </div>
              {current && (
                <div className="mt-0.5">
                  <span className="opacity-85">A nombre de: </span>
                  <span className="font-bold">{current.accountName}</span>
                </div>
              )}
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
              className="absolute top-6 left-1/2 inline-flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-2xl px-4 py-2 text-white backdrop-blur-md"
              style={{ background: 'rgba(255, 255, 255, 0.16)' }}
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="smartphone" size={18} filled />
                <span className="font-mono text-sm font-bold tracking-wide">
                  {marca} · {numero}
                </span>
              </span>
              {current && (
                <span className="text-[11px] font-semibold opacity-90">{current.accountName}</span>
              )}
            </span>
          )}

          <img
            src={qrUrl}
            alt={`QR de ${marca} de ${businessName ?? 'el local'}`}
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

/**
 * Lo que dice la pestaña. Normalmente basta la billetera; si el local cargó dos
 * cuentas de la MISMA app, se desempata con los últimos dígitos del número —de
 * otro modo el motorizado vería dos pestañas idénticas y no sabría cuál acaba
 * de probar.
 */
function tabLabel(qr: PaymentQrView, all: PaymentQrView[]): string {
  const marca = walletLabel(qr.wallet)
  const repetida = all.filter((m) => m.wallet === qr.wallet).length > 1
  return repetida ? `${marca} ·${qr.accountNumber.slice(-3)}` : marca
}
