'use client'

import { cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { OrderVM } from '@/lib/orders/view-model'
import { soles } from '../primitives'
import { PREP_PRESETS } from './constants'
import type { DetailItem, RejectReason } from './types'

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

/**
 * Confirmación directa del prepago: la cajera ya vio la plata en su cuenta de
 * Yape/Plin y no espera la captura del cliente.
 *
 * Es el ÚNICO botón del panel que mueve dinero por la palabra de quien lo
 * pulsa: no hay comprobante que mirar después, y `preparing` ya no se deshace
 * solo. De ahí que el aviso vaya en rojo y no como nota al pie, y que el botón
 * diga qué se está afirmando ("pago recibido") en vez de un "confirmar" que no
 * compromete a nada.
 */
export function ConfirmDirectPaymentModal({
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
      <div className="max-h-full w-full max-w-[440px] overflow-y-auto rounded-t-[20px] bg-white p-5 pb-7 shadow-elev-3">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-success-soft text-success">
            <Icon weight={500} name="account_balance_wallet" size={20} filled />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold">¿Confirmar pago recibido?</div>
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

        <div className="mb-3 flex items-center justify-between rounded-xl border border-success/40 bg-success/10 px-3.5 py-3">
          <span className="text-[13px] font-semibold text-success">Monto por Yape / Plin</span>
          <span className="font-mono text-[20px] font-extrabold text-success">
            {soles(order.total)}
          </span>
        </div>

        <div className="mb-4 flex gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
          <Icon
            weight={500}
            name="warning"
            size={18}
            filled
            className="mt-px shrink-0 text-danger"
          />
          <div className="text-[12px] leading-[1.45] text-danger">
            Revisa tu cuenta y asegúrate de que el dinero <strong>ya entró</strong> antes de
            continuar. El pedido pasa directo a cocina y no habrá comprobante que revisar después.
          </div>
        </div>

        <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
          Tiempo estimado de preparación
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
            <Icon weight={500} name="check_circle" size={18} filled /> Sí, pago recibido
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-warning-soft text-warning">
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

        <div className="mb-3 rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
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

export function ComandaModal({
  order,
  items,
  onClose,
}: {
  order: OrderVM
  items: DetailItem[]
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comanda de cocina"
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-elev-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon weight={500} name="restaurant_menu" size={20} />
            </div>
            <div>
              <div className="text-[16px] font-bold text-ink">Comanda de cocina</div>
              <div className="text-[12px] font-medium text-ink-muted">
                #{order.id} · {order.customer ?? 'Cliente'} ({items.length}{' '}
                {items.length === 1 ? 'ítem' : 'ítems'})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-ink/[0.06] text-ink hover:bg-ink/[0.12]"
          >
            <Icon weight={500} name="close" size={18} />
          </button>
        </div>

        {/* Items scroll */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-surface/50 p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-ink px-2 font-mono text-[14px] font-black text-white">
                    {it.qty}×
                  </span>
                  <span className="text-[16px] font-bold text-ink">{it.name}</span>
                </div>
                <span className="font-mono text-[14px] font-semibold text-ink-muted">
                  {soles(it.price)}
                </span>
              </div>
              {it.mods && (
                <div className="pl-9 text-[13px] text-ink-muted">
                  <span className="font-semibold text-ink-subtle">Opciones:</span> {it.mods}
                </div>
              )}
              {it.note && (
                <div className="mt-1 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-950">
                  <Icon
                    weight={500}
                    name="priority_high"
                    size={16}
                    className="mt-0.5 shrink-0 text-amber-800"
                  />
                  <span>NOTA: {it.note}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-surface px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-semibold uppercase text-ink-muted">
              Total pedido:
            </span>
            <span className="font-mono text-[18px] font-bold text-ink">{soles(order.total)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Cerrar comanda
          </button>
        </div>
      </div>
    </div>
  )
}
