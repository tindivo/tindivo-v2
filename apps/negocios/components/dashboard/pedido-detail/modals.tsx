'use client'

import { cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { OrderVM } from '@/lib/orders/view-model'
import { PREP_PRESETS } from './constants'
import type { RejectReason } from './types'

export function ReasonModal({
  title,
  subtitle,
  reasons,
  confirmLabel,
  cancelLabel,
  order,
  onClose,
  onConfirm,
}: {
  title: string
  subtitle: string
  reasons: RejectReason[]
  confirmLabel: string
  cancelLabel: string
  order: OrderVM
  onClose: () => void
  onConfirm: (code: string, text: string) => void
}) {
  const [sel, setSel] = useState(0)
  return (
    <div className="absolute inset-0 z-[300] flex items-end justify-center bg-black/50">
      <div className="w-full max-w-[440px] rounded-t-[20px] bg-white p-5 pb-7 shadow-elev-3">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-danger-soft text-danger">
            <Icon weight={500} name="cancel" size={20} filled />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">{title}</div>
            <div className="mt-px text-xs text-ink-muted">
              #{order.id} · {order.customer ?? 'Cliente'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border-none bg-ink/[0.06]"
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
          {subtitle}
        </div>
        <div className="mb-4 flex flex-col gap-1.5">
          {reasons.map((r, i) => (
            <button
              type="button"
              key={r.code + i}
              onClick={() => setSel(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl border-transparent px-3 py-2.5 text-left text-[13px]',
                i === sel ? 'bg-ink text-white' : 'bg-surface text-ink',
              )}
            >
              <div
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                  i === sel ? 'border-white bg-white' : 'border-border bg-transparent',
                )}
              >
                {i === sel && <div className="h-[7px] w-[7px] rounded-full bg-ink" />}
              </div>
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              const r = reasons[sel]
              if (r) onConfirm(r.code, r.label)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PrepTimeModal({
  order,
  onClose,
  onConfirm,
}: {
  order: OrderVM
  onClose: () => void
  onConfirm: (prep: number) => void
}) {
  const [sel, setSel] = useState(20)
  return (
    <div className="absolute inset-0 z-[300] flex items-end justify-center bg-black/50">
      <div className="w-full max-w-[440px] rounded-t-[20px] bg-white p-5 pb-7 shadow-elev-3">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
            <Icon weight={500} name="schedule" size={20} filled />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Tiempo de preparación</div>
            <div className="mt-px text-xs text-ink-muted">
              #{order.id} · {order.customer ?? 'Cliente'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border-none bg-ink/[0.06]"
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
          Selecciona el tiempo estimado para cocinar
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          {PREP_PRESETS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSel(m)}
              className={cn(
                'cursor-pointer rounded-xl py-3 text-sm font-bold transition-all',
                m === sel
                  ? 'border-transparent bg-ink text-white'
                  : 'border border-border bg-white text-ink',
              )}
            >
              {m} min
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_2fr] gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(sel)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Confirmar y empezar
          </button>
        </div>
      </div>
    </div>
  )
}

const PAUSE_OPTS: { label: string; sub: string; min: number | null; default?: boolean }[] = [
  { label: '15 minutos', sub: 'Para un pico rápido', min: 15 },
  { label: '30 minutos', sub: 'La opción más común', min: 30, default: true },
  { label: '1 hora', sub: 'Para horas de alta demanda', min: 60 },
  { label: '2 horas', sub: 'Para el resto del turno', min: 120 },
  { label: 'Hasta que reactive', sub: 'Sin tiempo fijo', min: null },
]

export function PausarModal({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean
  onClose: () => void
  onConfirm: (minutes: number | null) => void
}) {
  const [sel, setSel] = useState(1)
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 p-5">
      <div className="w-full max-w-[340px] rounded-[20px] bg-white p-5 shadow-elev-4">
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-warning-soft text-amber-800">
            <Icon weight={500} name="pause_circle" size={22} filled />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">Pausar pedidos</div>
            <div className="mt-px text-xs text-ink-muted">¿Por cuánto tiempo?</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border-none bg-ink/[0.06]"
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div className="mb-3.5 flex flex-col gap-1">
          {PAUSE_OPTS.map((o, i) => (
            <button
              type="button"
              key={o.label}
              onClick={() => setSel(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border-transparent px-3 py-2 text-left',
                i === sel ? 'bg-ink text-white' : 'bg-surface text-ink',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{o.label}</div>
                <div className="text-[11px] text-ink-muted opacity-65">{o.sub}</div>
              </div>
              {i === sel && <Icon weight={500} name="check" size={16} />}
            </button>
          ))}
        </div>

        <div className="mb-3 rounded-lg bg-warning-soft p-2.5 text-xs text-amber-800">
          <strong>Los pedidos activos continúan</strong> su flujo. Solo se bloquean los nuevos desde
          la web.
        </div>
        <button
          type="button"
          onClick={() => onConfirm(PAUSE_OPTS[sel]?.min ?? null)}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {PAUSE_OPTS[sel]?.min
            ? `Confirmar pausa de ${PAUSE_OPTS[sel]?.label.toLowerCase()}`
            : 'Confirmar pausa'}
        </button>
      </div>
    </div>
  )
}
