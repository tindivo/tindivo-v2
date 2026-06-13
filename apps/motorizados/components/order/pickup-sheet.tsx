'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
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
          <div
            className="mb-4 flex items-start gap-2 rounded-[14px] px-3.5 py-2.5 text-[13px]"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#92400E' }}
          >
            <span className="mt-0.5 shrink-0">
              <Icon.Clock />
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
              className="flex-1 rounded-[16px] py-3 text-center font-semibold text-[14px]"
              style={
                slots === s.value
                  ? {
                      border: '2px solid #F97316',
                      background: 'rgba(249,115,22,0.05)',
                      color: '#C2410C',
                    }
                  : {
                      border: '1px solid rgba(26,22,20,0.1)',
                      background: '#fff',
                      color: 'rgba(26,22,20,0.6)',
                    }
              }
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
              className="rounded-[18px] p-4 text-left"
              style={
                band === b.value
                  ? { border: '2px solid #F97316', background: 'rgba(249,115,22,0.05)' }
                  : { border: '1px solid rgba(26,22,20,0.1)', background: '#fff' }
              }
            >
              <p className="font-semibold text-[15px]">{b.label}</p>
              <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                {b.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-ink/5 border-t px-5 pt-3.5 pb-6">
        <button
          type="button"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!band || busy}
          onClick={() => band && onConfirm({ band, slots })}
        >
          {busy ? 'Confirmando…' : 'Confirmar recogida'}
        </button>
      </div>
    </BottomSheet>
  )
}
