'use client'

import { BottomSheet, Button, cn, Icon } from '@tindivo/ui'
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
        <h2 className="font-display text-title font-bold tracking-tight">Confirmar recogida</h2>
        <p className="mt-0.5 text-caption text-ink-muted">
          #{order.shortId} · {business?.name ?? 'Restaurante'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {/* `text-warning` (#f59e0b) sobre `warning-soft` da ~2:1: el aviso se
            leía como un borrón amarillo. El ámbar oscuro pasa de 8:1. */}
        {premature && (
          <div className="mb-4 flex items-start gap-2.5 rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-caption text-amber-900">
            <Icon name="schedule" size={20} filled className="mt-px shrink-0" />
            <span>
              Aún faltan {minutesEarly} min para la hora estimada. Confirma con el local que es tu
              pedido.
            </span>
          </div>
        )}

        {/* Recordatorio del dinero justo antes de salir del local: es el último
            momento en que el motorizado puede preguntar sin volver. */}
        <div className="mb-4 flex items-center justify-between rounded-[14px] bg-surface px-3.5 py-3">
          <span className="text-caption text-ink-muted">
            {cobra ? 'Cobras al entregar' : 'Ya está pagado'}
          </span>
          <span
            className={`font-display text-lead font-bold tracking-tight ${cobra ? 'text-ink' : 'text-success'}`}
          >
            {cobra ? soles(total) : 'No cobrar'}
          </span>
        </div>

        {/* La pregunta es lo que decide el bloqueo de la mochila, así que se
            lee como pregunta y no como microetiqueta: en versalita de 10px
            competía con las opciones que la contestan. */}
        <p className="mb-2 font-semibold text-body text-ink">
          ¿Cuánto espacio ocupa en la mochila?
        </p>
        <div className="flex gap-2">
          {SLOT_OPTIONS.map((s) => {
            const active = slots === s.value
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSlots(s.value)}
                className={cn(
                  'flex-1 rounded-2xl py-3 text-center transition-colors',
                  active
                    ? 'border-2 border-brand bg-brand-soft text-brand-dark'
                    : 'border border-ink/10 bg-card text-ink hover:bg-surface',
                )}
              >
                <span className="block text-body font-semibold">{s.label}</span>
                {/* `text-ink-muted` en vez de heredar el gris con `opacity-70`:
                    encima de un botón ya atenuado, la pista quedaba en ~2:1. */}
                <span
                  className={cn(
                    'mt-0.5 block text-meta',
                    active ? 'text-brand-dark/80' : 'text-ink-muted',
                  )}
                >
                  {s.hint}
                </span>
              </button>
            )
          })}
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
