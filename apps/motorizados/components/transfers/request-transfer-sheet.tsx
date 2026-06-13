'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet } from '@tindivo/ui'
import { useState } from 'react'
import { api } from '@/lib/api'
import { soles } from '@/lib/format'

export interface TransferTarget {
  orderId: string
  shortId: string
  businessName: string | null
  total: number
  driverName: string
}

/** Confirmación de solicitud de traspaso (explica el TTL con timeout-as-accept). */
export function RequestTransferSheet({
  target,
  onClose,
  onSent,
}: {
  target: TransferTarget
  onClose: () => void
  onSent: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/driver/orders/${target.orderId}/transfer-request`, {}, crypto.randomUUID())
      onSent()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
      setBusy(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="t-display text-[20px]">¿Pedirle este pedido a {target.driverName}?</h2>
        <p className="t-muted mt-2 text-[14px] leading-relaxed">
          Le llegará una solicitud. Si no responde en 30 segundos, el pedido pasará a ti
          automáticamente.
        </p>

        <div className="t-card mt-4">
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold text-[13px]">#{target.shortId}</span>
            <span className="t-display text-[16px] tabular-nums">{soles(target.total)}</span>
          </div>
          {target.businessName && (
            <p className="mt-0.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              {target.businessName}
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            className="t-btn t-btn-primary t-btn-block"
            disabled={busy}
            onClick={send}
          >
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
          <button type="button" className="t-btn t-btn-ghost t-btn-block" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
