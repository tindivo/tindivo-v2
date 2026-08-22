'use client'

import { type PaymentQrView, walletLabel } from '@tindivo/contracts'
import { useState } from 'react'

/**
 * A quién le paga el cliente cuando prepaga (0184).
 *
 * Una sola cuenta: la principal del local. El negocio puede tener dada de alta
 * una segunda, pero esa es el repuesto de la puerta —si el QR impreso no
 * escanea, el motorizado tiene que poder cobrar igual—. Prepagando desde casa
 * no hay esa urgencia, y ofrecer dos cuentas solo abre la puerta a que el
 * cliente pague a la que la cajera no está conciliando.
 *
 * El nombre del titular no es adorno. Al transferir por número, Yape y Plin
 * enseñan a quién le estás pagando justo antes de confirmar; sin ese nombre a
 * la vista, el cliente no tiene contra qué compararlo y solo puede confiar en
 * que tecleó bien los nueve dígitos.
 */
export function PaymentAccountCard({
  method,
  fallbackNumber,
  onZoom,
}: {
  /** La cuenta principal del local, o `null` si no hay ninguna dada de alta. */
  method: PaymentQrView | null
  /** Número suelto del negocio, para locales sin métodos dados de alta. */
  fallbackNumber: string | null
  onZoom: (url: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const numero = method?.accountNumber ?? fallbackNumber
  if (!numero) return null

  const marca = method ? walletLabel(method.wallet) : 'Yape / Plin'

  function copy() {
    if (!numero) return
    navigator.clipboard.writeText(numero)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 rounded-[16px] border border-ink/[0.06] bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">{marca}</div>
          <div className="font-mono text-[16px] font-bold text-brand">{numero}</div>
          {method && (
            <div className="truncate text-[12px] text-ink-muted">
              A nombre de <span className="font-semibold text-ink">{method.accountName}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-white px-2 py-0.5 font-sans text-[11px] font-medium text-ink shadow-sm"
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>

      {method?.qrUrl && (
        <div className="mt-3 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => onZoom(method.qrUrl as string)}
            className="group relative h-40 w-40 overflow-hidden rounded-xl bg-white p-2 shadow-xs transition-all hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand"
            aria-label={`Agrandar código QR de ${marca}`}
          >
            <img
              src={method.qrUrl}
              alt={`QR de ${marca}`}
              className="h-full w-full object-contain"
              decoding="async"
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
                Agrandar 🔍
              </span>
            </div>
          </button>
          <span className="mt-2 text-[12px] font-medium text-ink-muted">
            Escanea para pagar •{' '}
            <span className="font-semibold text-brand">Toca para agrandar</span>
          </span>
        </div>
      )}

      {/* Un método puede existir sin imagen: se cobra dictando el número. */}
      {method && !method.qrUrl && (
        <p className="mt-2 text-[12px] text-ink-muted">
          Esta cuenta no tiene QR: transfiere al número desde {marca}.
        </p>
      )}
    </div>
  )
}
