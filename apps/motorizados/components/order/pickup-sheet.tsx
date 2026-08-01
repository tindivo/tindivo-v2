'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

const SLOT_OPTIONS = [
  { value: 1, label: '1 · Pequeño', hint: 'Una bolsa' },
  { value: 2, label: '2 · Mediano', hint: 'Dos bolsas' },
  { value: 3, label: '3 · Grande', hint: 'Llena la mochila' },
] as const

/**
 * Confirmación de recogida: solo el espacio que ocupa en la mochila (HU-D-024).
 *
 * La banda cerca/lejos ya no se pregunta (0120): no es un dato que el
 * motorizado decida —sale de la ubicación en los pedidos web y de la cajera en
 * los manuales— y desde la 0110 tampoco cambia lo que se cobra.
 */
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
  onConfirm: (opts: { slots: number }) => void
  onClose: () => void
}) {
  const [slots, setSlots] = useState(1)
  const { order, business } = detail
  const premature = order.estimatedReadyAt != null && Date.parse(order.estimatedReadyAt) > now
  const minutesEarly = premature
    ? Math.max(1, Math.round((Date.parse(order.estimatedReadyAt as string) - now) / 60_000))
    : 0
  const total = order.orderAmount + order.deliveryFee
  const cobra = order.paymentIntent !== 'prepaid'

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

        {/* Recordatorio del dinero justo antes de salir del local: es el último
            momento en que el motorizado puede preguntar sin volver. */}
        <div className="mb-4 flex items-center justify-between rounded-[14px] bg-surface px-3.5 py-3">
          <span className="text-[13px] text-ink-muted">
            {cobra ? 'Cobras al entregar' : 'Ya está pagado'}
          </span>
          <span className={`t-display text-[18px] ${cobra ? 'text-ink' : 'text-success'}`}>
            {cobra ? soles(total) : 'No cobrar'}
          </span>
        </div>

        <span className="t-field-label">¿Cuánto espacio ocupa en la mochila?</span>
        <div className="flex gap-2">
          {SLOT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSlots(s.value)}
              className={`flex-1 rounded-2xl border py-3 text-center transition-colors ${
                slots === s.value
                  ? 'border-2 border-brand bg-brand/5 text-brand-dark'
                  : 'border-ink/10 bg-card text-ink-muted hover:bg-surface'
              }`}
            >
              <span className="block text-[14px] font-semibold">{s.label}</span>
              <span className="mt-0.5 block text-[11px] opacity-70">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-ink/5 px-5 pt-3.5 pb-6">
        <Button className="w-full" disabled={busy} onClick={() => onConfirm({ slots })}>
          {busy ? 'Confirmando…' : 'Confirmar recogida'}
        </Button>
      </div>
    </BottomSheet>
  )
}
