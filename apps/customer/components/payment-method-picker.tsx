'use client'

import { type PaymentQrView, walletLabel } from '@tindivo/contracts'
import { useState } from 'react'

/**
 * A quién le paga el cliente cuando prepaga (0184).
 *
 * El local puede tener hasta dos cuentas, y no tienen por qué ser de la misma
 * app: por eso hay pestañas y por eso cada una dice su billetera. El cliente
 * abre Yape o Plin según lo que diga la pestaña.
 *
 * El nombre del titular no es adorno. Al transferir por número, Yape y Plin
 * enseñan a quién le estás pagando justo antes de confirmar; sin ese nombre a
 * la vista, el cliente no tiene contra qué compararlo y solo puede confiar en
 * que tecleó bien los nueve dígitos.
 */
export function PaymentMethodPicker({
  methods,
  fallbackNumber,
  onZoom,
}: {
  methods: PaymentQrView[]
  /** Número suelto del negocio, para locales sin métodos dados de alta. */
  fallbackNumber: string | null
  onZoom: (url: string) => void
}) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)

  const current = methods[active] ?? methods[0] ?? null
  const numero = current?.accountNumber ?? fallbackNumber
  if (!numero) return null

  const marca = current ? walletLabel(current.wallet) : 'Yape / Plin'

  function copy() {
    if (!numero) return
    navigator.clipboard.writeText(numero)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 rounded-[16px] border border-ink/[0.06] bg-surface p-3.5">
      {methods.length > 1 && (
        <div className="mb-3 flex gap-1 rounded-xl bg-ink/[0.05] p-1">
          {methods.map((m, i) => (
            <button
              key={m.slot}
              type="button"
              onClick={() => {
                setActive(i)
                setCopied(false)
              }}
              aria-pressed={i === active}
              className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold transition-colors ${
                i === active ? 'bg-white text-brand shadow-sm' : 'text-ink-muted'
              }`}
            >
              {walletLabel(m.wallet)}
              {methods.filter((x) => x.wallet === m.wallet).length > 1 &&
                ` ·${m.accountNumber.slice(-3)}`}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">{marca}</div>
          <div className="font-mono text-[16px] font-bold text-brand">{numero}</div>
          {current && (
            <div className="truncate text-[12px] text-ink-muted">
              A nombre de <span className="font-semibold text-ink">{current.accountName}</span>
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

      {current?.qrUrl && (
        <div className="mt-3 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => onZoom(current.qrUrl as string)}
            className="group relative h-40 w-40 overflow-hidden rounded-xl bg-white p-2 shadow-xs transition-all hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand"
            aria-label={`Agrandar código QR de ${marca}`}
          >
            <img
              src={current.qrUrl}
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
      {current && !current.qrUrl && (
        <p className="mt-2 text-[12px] text-ink-muted">
          Esta cuenta no tiene QR: transfiere al número desde {marca}.
        </p>
      )}
    </div>
  )
}
