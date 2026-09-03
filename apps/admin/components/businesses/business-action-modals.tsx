'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { PhonePeSchema } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { fieldSm } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

// Presets de modo de negocio
export const MODE_PRESETS = {
  delivery: {
    label: 'Delivery Tindivo',
    desc: 'Pedidos web con motorizados de Tindivo.',
    flags: {
      publishesCatalog: true,
      acceptsWebPickup: false,
      acceptsWebDelivery: true,
      usesTindivoDrivers: true,
    },
  },
  catalog: {
    label: 'Solo catálogo (WhatsApp)',
    desc: 'El cliente arma su pedido en el catálogo y lo envía por WhatsApp. Sin delivery de la plataforma.',
    flags: {
      publishesCatalog: true,
      acceptsWebPickup: false,
      acceptsWebDelivery: false,
      usesTindivoDrivers: false,
    },
  },
} as const

export type ModePresetKey = keyof typeof MODE_PRESETS

interface ModeModalProps {
  business: { id: string; name: string; primary_capability: string }
  onClose: () => void
  onSuccess: () => void
}

export function ModeModal({ business, onClose, onSuccess }: ModeModalProps) {
  const [modePreset, setModePreset] = useState<ModePresetKey>(
    business.primary_capability === 'catalog_only' ? 'catalog' : 'delivery',
  )
  const [whatsapp, setWhatsapp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ApiEnvelope<{ whatsapp_number: string | null }>>(`/admin/businesses/${business.id}`)
      .then((r) => {
        if (r.data?.whatsapp_number) setWhatsapp(r.data.whatsapp_number)
      })
      .catch(() => {})
  }, [business.id])

  const waParsed = PhonePeSchema.safeParse(whatsapp)
  const waValid = waParsed.success
  const waDigits = waParsed.success ? waParsed.data : ''

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/admin/businesses/${business.id}`, {
        ...MODE_PRESETS[modePreset].flags,
        ...(modePreset === 'catalog' ? { whatsappNumber: waDigits } : {}),
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cambiar modo de operación"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="document"
        className="w-full max-w-lg rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 pb-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-ink">Cambiar modo de operación</h3>
            <p className="text-[12px] text-ink-muted">{business.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] text-ink-subtle hover:text-ink leading-none px-2"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-4 text-[13px] text-danger">{error}</p>}

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {(Object.keys(MODE_PRESETS) as ModePresetKey[]).map((k) => {
              const preset = MODE_PRESETS[k]
              const on = modePreset === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setModePreset(k)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    on
                      ? 'border-brand bg-brand/5 ring-1 ring-brand'
                      : 'border-ink/10 hover:border-ink/25'
                  }`}
                >
                  <div className="font-semibold text-[14px] text-ink">{preset.label}</div>
                  <div className="mt-1 text-[12px] text-ink-subtle">{preset.desc}</div>
                </button>
              )
            })}
          </div>

          {modePreset === 'catalog' && (
            <div>
              <label
                htmlFor="catalog-whatsapp-input"
                className="block text-[12px] font-semibold text-ink-muted mb-1"
              >
                WhatsApp para pedidos del cliente
              </label>
              <input
                id="catalog-whatsapp-input"
                className={`${fieldSm} w-full`}
                placeholder="Ej. 9XXXXXXXX (obligatorio)"
                inputMode="numeric"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              {whatsapp.trim().length > 0 && !waValid && (
                <p className="mt-1 text-[12px] text-danger">
                  Celular peruano inválido (9 dígitos, empieza con 9).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-ink/10 pt-4">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={busy || (modePreset === 'catalog' && !waValid)}
            onClick={submit}
          >
            {busy ? 'Guardando…' : 'Aplicar modo'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface BlockModalProps {
  business: { id: string; name: string; is_blocked: boolean }
  onClose: () => void
  onSuccess: () => void
}

export function BlockModal({ business, onClose, onSuccess }: BlockModalProps) {
  const [reason, setReason] = useState('')
  const [forDebt, setForDebt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBlocked = business.is_blocked

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      if (isBlocked) {
        await api.post(`/admin/businesses/${business.id}/unblock`, {})
      } else {
        await api.post(`/admin/businesses/${business.id}/block`, { reason, forDebt })
      }
      onSuccess()
      onClose()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isBlocked ? 'Desbloquear negocio' : 'Bloquear negocio'}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="document"
        className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 pb-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-ink">
              {isBlocked ? 'Desbloquear negocio' : 'Bloquear negocio'}
            </h3>
            <p className="text-[12px] text-ink-muted">{business.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] text-ink-subtle hover:text-ink leading-none px-2"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-4 text-[13px] text-danger">{error}</p>}

        {isBlocked ? (
          <div className="space-y-3">
            <p className="text-[14px] text-ink">
              ¿Estás seguro de que deseas levantar el bloqueo a este negocio? Podrá volver a operar
              normalmente en la plataforma.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="block-reason-input"
                className="block text-[12px] font-semibold text-ink-muted mb-1"
              >
                Motivo del bloqueo (obligatorio)
              </label>
              <textarea
                id="block-reason-input"
                className={`${fieldSm} w-full min-h-[70px] resize-none`}
                placeholder="Explica el motivo del bloqueo…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-[13px] text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={forDebt}
                onChange={(e) => setForDebt(e.target.checked)}
              />
              <span>
                <strong>Es por deuda</strong> — se reactiva automáticamente en cuanto liquide sus
                cargos pendientes.
              </span>
            </label>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-ink/10 pt-4">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant={isBlocked ? 'brand' : 'danger'}
            disabled={busy || (!isBlocked && reason.trim().length < 3)}
            onClick={submit}
          >
            {busy ? 'Procesando…' : isBlocked ? 'Confirmar desbloqueo' : 'Confirmar bloqueo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
