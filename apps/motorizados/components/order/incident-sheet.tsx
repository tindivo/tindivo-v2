'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { api } from '@/lib/api'

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'fake_address', label: 'Dirección falsa o inexistente' },
  { value: 'customer_abuse', label: 'Cliente agresivo o abusivo' },
  { value: 'payment_fraud', label: 'Problema con el pago' },
  { value: 'other', label: 'Otro' },
]

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
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        {done ? (
          <div className="py-4 text-center">
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
              style={{ background: '#1A8050' }}
            >
              <Icon.Check />
            </span>
            <p className="t-display mt-3 text-[18px]">Reporte enviado</p>
            <p className="t-muted mt-1 text-[14px]">El equipo de Tindivo lo revisará.</p>
            <button type="button" className="t-btn t-btn-ghost t-btn-block mt-4" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <h2 className="t-display text-[20px]">¿Qué problema hubo?</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className="rounded-full px-3.5 py-2 font-semibold text-[13px]"
                  style={
                    type === t.value
                      ? { background: '#F97316', color: '#fff' }
                      : {
                          background: 'rgba(26,22,20,0.04)',
                          border: '1px solid rgba(26,22,20,0.08)',
                        }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="t-field mt-4"
              placeholder="Detalle (opcional)"
              value={desc}
              maxLength={500}
              onChange={(e) => setDesc(e.target.value)}
            />
            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            <button
              type="button"
              className="t-btn t-btn-block mt-4 text-white"
              style={{ background: '#DC2626' }}
              disabled={busy || !type}
              onClick={submit}
            >
              {busy ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
