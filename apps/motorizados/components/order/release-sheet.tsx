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

/** Una sola fuente para el título: lo pinta la pantalla y nombra el diálogo. */
const TITULO = '¿Soltar este pedido?'

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
    <BottomSheet open label={TITULO} onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight text-danger">{TITULO}</h2>
        <p className="mt-1.5 text-body leading-relaxed text-ink-muted">
          El pedido volverá al pool para que lo tome otro motorizado. Selecciona el motivo
          obligatorio:
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {RELEASE_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`rounded-2xl p-3.5 text-left text-body font-semibold transition-colors border ${
                reason === r.value
                  ? 'border-danger bg-danger/15 text-danger'
                  : 'border-ink/[0.08] bg-ink/[0.04] text-ink hover:bg-ink/[0.08]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          className="mt-4 w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-base font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/8"
          placeholder="Nota adicional (opcional)"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="mt-2 text-caption text-danger">{error}</p>}

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
