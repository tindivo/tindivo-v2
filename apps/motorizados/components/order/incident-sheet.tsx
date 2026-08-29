'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { api } from '@/lib/api'

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'fake_address', label: 'Dirección falsa o inexistente' },
  { value: 'customer_abuse', label: 'Cliente agresivo o abusivo' },
  { value: 'payment_fraud', label: 'Problema con el pago' },
  { value: 'other', label: 'Otro' },
]

/** Una sola fuente para el título: lo pinta la pantalla y nombra el diálogo. */
const TITULO = '¿Qué problema hubo?'

/** Reporte de incidente del motorizado (antifraude), con idempotencia. */
export function IncidentSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [type, setType] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!type) return
    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/driver/incidents',
        { orderId, incidentType: type, description: desc || undefined },
        crypto.randomUUID(),
      )
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open label={TITULO} onClose={onClose}>
      <div className="p-5 pb-7">
        {done ? (
          <div className="py-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
              <Icon name="check" size={20} />
            </span>
            <p className="mt-3 font-display text-lead font-bold tracking-tight">Reporte enviado</p>
            <p className="mt-1 text-body text-ink-muted">El equipo de Tindivo lo revisará.</p>
            <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-title font-bold tracking-tight">{TITULO}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`rounded-full px-3.5 py-2 text-caption font-semibold transition-colors ${
                    type === t.value
                      ? 'bg-brand text-white'
                      : 'border border-ink/[0.08] bg-ink/[0.04] text-ink hover:bg-ink/[0.08]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="mt-4 w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-base font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/8"
              placeholder="Detalle (opcional)"
              value={desc}
              maxLength={500}
              onChange={(e) => setDesc(e.target.value)}
            />
            {error && <p className="mt-2 text-caption text-danger">{error}</p>}
            <Button
              variant="danger"
              className="mt-4 w-full"
              disabled={busy || !type}
              onClick={submit}
            >
              {busy ? 'Enviando…' : 'Enviar reporte'}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
