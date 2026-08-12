'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Confirmación de recogida.
 *
 * YA NO SE PREGUNTA POR LA MOCHILA. Era la última pregunta antes de salir del
 * local, con la comida en la mano y el reloj corriendo, y la respuesta era
 * siempre «1»: bajo esa presión nadie se para a estimar bolsas. Un dato que
 * siempre vale lo mismo no informa nada, y este además alimentaba el bloqueo de
 * capacidad — o sea que una respuesta apurada decidía si podías tomar el
 * siguiente pedido. Cada pedido pasa a valer 1 y se acabó la pregunta.
 *
 * La banda cerca/lejos tampoco se pregunta desde la 0120: no es un dato que el
 * motorizado decida —sale de la ubicación en los pedidos web y de la cajera en
 * los manuales— y desde la 0110 tampoco cambia lo que se cobra.
 *
 * Lo que queda es lo que sí sirve en el mostrador: si llegas antes de tiempo, y
 * cuánto vas a cobrar.
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
      </div>

      <div className="border-t border-ink/5 px-5 pt-3.5 pb-6">
        {/* `slots: 1` fijo. El contrato con el backend NO cambia en este paso:
            `occupancy_slots` sigue existiendo y `advance_order` sigue
            escribiéndola. Lo que se va es la pregunta, no la columna. */}
        <Button className="w-full" disabled={busy} onClick={() => onConfirm({ slots: 1 })}>
          {busy ? 'Confirmando…' : 'Confirmar recogida'}
        </Button>
      </div>
    </BottomSheet>
  )
}
