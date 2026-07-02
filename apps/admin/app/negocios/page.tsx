'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { PhonePeSchema } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState, fieldSm, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'
import { openImpersonation } from '@/lib/impersonate'

interface BizRow {
  id: string
  name: string
  primary_capability: string
  is_active: boolean
  is_blocked: boolean
  balance_due: number
}

// Labels amigables del modo derivado (primary_capability).
const CAPABILITY_LABELS: Record<string, string> = {
  drivers_only: 'Solo motorizados',
  catalog_pickup: 'Catálogo + recojo',
  catalog_delivery: 'Catálogo + delivery',
  catalog_full: 'Catálogo completo',
  pickup_local: 'Atención en local',
  catalog_only: 'Solo catálogo (WhatsApp)',
}

// Presets de modo: el PATCH manda los 4 flags y el trigger de la DB deriva
// primary_capability. Reversible en ambos sentidos.
const MODE_PRESETS = {
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

type ModePresetKey = keyof typeof MODE_PRESETS

export default function NegociosPage() {
  const [rows, setRows] = useState<BizRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [blockId, setBlockId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [modeId, setModeId] = useState<string | null>(null)
  const [modePreset, setModePreset] = useState<ModePresetKey>('delivery')
  const [modeWhatsapp, setModeWhatsapp] = useState('')
  const modeIdRef = useRef<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      setBlockId(null)
      setReason('')
      setModeId(null)
      modeIdRef.current = null
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  /** Abre/cierra el panel de modo de una fila, prefilando el WhatsApp guardado. */
  async function toggleModePanel(b: BizRow) {
    if (modeId === b.id) {
      setModeId(null)
      modeIdRef.current = null
      return
    }
    setModeId(b.id)
    modeIdRef.current = b.id
    setModePreset(b.primary_capability === 'catalog_only' ? 'catalog' : 'delivery')
    setModeWhatsapp('')
    try {
      const r = await api.get<ApiEnvelope<{ whatsapp_number: string | null }>>(
        `/admin/businesses/${b.id}`,
      )
      // Prefill best-effort: solo si el panel sigue abierto para esta fila.
      if (modeIdRef.current === b.id) setModeWhatsapp(r.data.whatsapp_number ?? '')
    } catch {
      // Sin prefill: el admin puede escribir el número manualmente.
    }
  }

  // Primitiva canónica: 9 dígitos empezando en 9; tolera espacios/guiones y +51.
  const waParsed = PhonePeSchema.safeParse(modeWhatsapp)
  const waValid = waParsed.success
  const waDigits = waParsed.success ? waParsed.data : ''

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Red"
        title="Negocios"
        description={rows ? `${rows.length} negocios` : 'Negocios de la plataforma.'}
        right={
          <>
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
            <Link
              href="/negocios/nuevo"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 font-medium text-[14px] text-white transition-colors hover:bg-brand-dark"
            >
              <Ico.plus className="h-4 w-4" />
              Nuevo
            </Link>
          </>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : rows.length === 0 ? (
        <div className="t-card">
          <EmptyState icon={<Ico.store className="h-5 w-5" />} title="Sin negocios todavía" />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id} className="t-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[15px] text-ink">{b.name}</span>
                    {!b.is_active && <StatusBadge label="Inactivo" tone="neutral" />}
                    {b.is_blocked && <StatusBadge label="Bloqueado" tone="danger" />}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-subtle">
                    {CAPABILITY_LABELS[b.primary_capability] ?? b.primary_capability} · deuda{' '}
                    <span className="font-mono">{soles(b.balance_due)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => toggleModePanel(b)}>
                    Modo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === b.id}
                    onClick={() =>
                      act(
                        () => api.patch(`/admin/businesses/${b.id}`, { isActive: !b.is_active }),
                        b.id,
                      )
                    }
                  >
                    {b.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  {b.is_blocked ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === b.id}
                      onClick={() =>
                        act(() => api.post(`/admin/businesses/${b.id}/unblock`, {}), b.id)
                      }
                    >
                      Desbloquear
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setBlockId(blockId === b.id ? null : b.id)
                        setReason('')
                      }}
                    >
                      Bloquear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openImpersonation('businesses', b.id)}
                  >
                    Entrar como
                  </Button>
                </div>
              </div>
              {blockId === b.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    className={`${fieldSm} flex-1`}
                    placeholder="Motivo del bloqueo (obligatorio)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === b.id || reason.trim().length < 3}
                    onClick={() =>
                      act(() => api.post(`/admin/businesses/${b.id}/block`, { reason }), b.id)
                    }
                  >
                    Confirmar
                  </Button>
                </div>
              )}
              {modeId === b.id && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                          <div className="font-semibold text-[13px] text-ink">{preset.label}</div>
                          <div className="mt-0.5 text-[12px] text-ink-subtle">{preset.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                  {modePreset === 'catalog' && (
                    <div>
                      <input
                        className={`${fieldSm} w-full`}
                        placeholder="WhatsApp para pedidos (9XXXXXXXX) — obligatorio"
                        inputMode="numeric"
                        value={modeWhatsapp}
                        onChange={(e) => setModeWhatsapp(e.target.value)}
                      />
                      {modeWhatsapp.trim().length > 0 && !waValid && (
                        <p className="mt-1 text-[12px] text-danger">
                          Celular peruano inválido (9 dígitos, empieza con 9).
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setModeId(null)
                        modeIdRef.current = null
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === b.id || (modePreset === 'catalog' && !waValid)}
                      onClick={() =>
                        act(
                          () =>
                            api.patch(`/admin/businesses/${b.id}`, {
                              ...MODE_PRESETS[modePreset].flags,
                              ...(modePreset === 'catalog' ? { whatsappNumber: waDigits } : {}),
                            }),
                          b.id,
                        )
                      }
                    >
                      Aplicar modo
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
