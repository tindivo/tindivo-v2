'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { OrderDetailResponse } from '@/lib/types'

const SLOT_OPTIONS = [
  { value: 1, label: '1 · Pequeño' },
  { value: 2, label: '2 · Mediano' },
  { value: 3, label: '3 · Grande' },
] as const

/** Confirmación de recogida: slots de mochila + banda de distancia (HU-D-024/025). */
export function PickupSheet({
  detail,
  now,
  busy,
  onConfirm,
  onClose,
}: {
  detail: OrderDetailResponse
  now: number
  busy: boolean
  onConfirm: (opts: { band: 'near' | 'far'; slots: number }) => void
  onClose: () => void
}) {
  const [slots, setSlots] = useState(1)
  const [band, setBand] = useState<'near' | 'far' | null>(null)
  const { order, business } = detail
  const premature = order.estimatedReadyAt != null && Date.parse(order.estimatedReadyAt) > now
  const minutesEarly = premature
    ? Math.max(1, Math.round((Date.parse(order.estimatedReadyAt as string) - now) / 60_000))
    : 0

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-2">
        <h2 className="t-display text-[20px]">Confirmar recogida</h2>
        <p className="t-muted mt-0.5 text-[13px]">
          #{order.shortId} · {business?.name ?? 'Restaurante'}
        </p>
      </div>

      <div className="t-scroll flex-1 px-5">
        {premature && (
          <div className="mb-4 flex items-start gap-2 rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-[13px] text-amber-900">
            <span className="mt-0.5 shrink-0">
              <Icon name="schedule" size={20} />
            </span>
            Aún faltan {minutesEarly} min para la hora estimada. Confirma con el local que es tu
            pedido.
          </div>
        )}

        <span className="t-field-label">¿Cuánto espacio ocupa en la mochila?</span>
        <div className="flex gap-2">
          {SLOT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSlots(s.value)}
              className={`flex-1 rounded-2xl border py-3 text-center text-[14px] font-semibold transition-colors ${
                slots === s.value
                  ? 'border-2 border-brand bg-brand/5 text-brand-dark'
                  : 'border-ink/10 bg-card text-ink-muted hover:bg-surface'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="t-field-label mt-5 block">¿Qué tan lejos queda la entrega?</span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'near', label: 'Cerca', desc: 'Dentro de la zona' },
              { value: 'far', label: 'Lejos', desc: 'Fuera de la zona / +1 km' },
            ] as const
          ).map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setBand(b.value)}
              className={`rounded-[18px] p-4 text-left transition-colors ${
                band === b.value
                  ? 'border-2 border-brand bg-brand/5'
                  : 'border border-ink/10 bg-card hover:bg-surface'
              }`}
            >
              <p className="font-semibold text-[15px] text-ink">{b.label}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{b.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-ink/5 px-5 pt-3.5 pb-6">
        <Button
          className="w-full"
          disabled={!band || busy}
          onClick={() => band && onConfirm({ band, slots })}
        >
          {busy ? 'Confirmando…' : 'Confirmar recogida'}
        </Button>
      </div>
    </BottomSheet>
  )
}
