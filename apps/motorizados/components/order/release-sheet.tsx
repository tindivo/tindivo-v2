'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet, Button } from '@tindivo/ui'
import { useState } from 'react'

const RELEASE_REASONS: { value: string; label: string }[] = [
  { value: 'averia', label: 'Avería de vehículo / llanta' },
  { value: 'emergencia', label: 'Emergencia personal' },
  { value: 'muy_lejos', label: 'Restaurante / dirección muy lejos' },
  { value: 'otro', label: 'Otro motivo' },
]

export function ReleaseSheet({
  onConfirm,
  onClose,
  busy,
}: {
  onConfirm: (reason: string, note?: string) => Promise<void>
  onClose: () => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!reason) return
    setError(null)
    try {
      await onConfirm(reason, note || undefined)
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error al soltar el pedido',
      )
    }
  }

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="t-display text-[20px] text-danger">¿Soltar este pedido?</h2>
        <p className="t-muted mt-1.5 text-[14px] leading-relaxed">
          El pedido volverá al pool para que lo tome otro motorizado. Selecciona el motivo
          obligatorio:
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {RELEASE_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`rounded-2xl p-3.5 text-left text-[14px] font-semibold transition-colors border ${
                reason === r.value
                  ? 'border-danger bg-danger/10 text-danger'
                  : 'border-ink/[0.08] bg-ink/[0.04] text-ink hover:bg-ink/[0.08]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          className="t-field mt-4"
          placeholder="Nota adicional (opcional)"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

        <div className="mt-5 flex flex-col gap-2.5">
          <Button
            variant="danger"
            className="w-full"
            disabled={busy || !reason}
            onClick={handleSubmit}
          >
            {busy ? 'Soltando…' : 'Sí, soltar pedido'}
          </Button>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
