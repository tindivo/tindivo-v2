'use client'

import { Badge, Card } from '@tindivo/ui'
import { SourceChip } from '@/components/source-chip'
import { PAYMENT_LABEL, soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/** Ficha de previsualización del pedido tomable (HU-D-015). */
export function PreviewSection({ detail, now }: { detail: OrderDetailResponse; now: number }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee
  const overdue =
    order.urgentSince != null ||
    (order.estimatedReadyAt != null && Date.parse(order.estimatedReadyAt) < now)

  return (
    <div>
      <div className="mt-1 flex items-center gap-2">
        <SourceChip source={order.source} />
        {overdue ? (
          <Badge variant="danger" size="sm">
            Vencido
          </Badge>
        ) : order.status === 'waiting_driver' ? (
          <Badge variant="warning" size="sm">
            Listo
          </Badge>
        ) : null}
      </div>

      <Card className="mt-3 p-[18px]">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          Recoger en
        </p>
        <p className="mt-1 text-[17px] font-semibold">{business?.name ?? 'Restaurante'}</p>
        {business?.address && (
          <p className="mt-0.5 text-[13px] text-ink-muted">{business.address}</p>
        )}
      </Card>

      <Card className="mt-3 p-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ink-muted">Total a cobrar</span>
          <span className="font-display text-[22px] font-bold tracking-tight tabular-nums">
            {soles(total)}
          </span>
        </div>
        <p className="mt-1 text-[14px]">
          {PAYMENT_LABEL[order.paymentIntent] ?? order.paymentIntent}
        </p>
        {order.paymentIntent === 'pending_cash' &&
          order.changeToGive != null &&
          order.changeToGive > 0 && (
            <div className="mt-2 rounded-[14px] bg-brand/10 px-3.5 py-2.5 text-[13px] font-semibold text-brand-dark">
              Lleva vuelto: {soles(order.changeToGive)}
            </div>
          )}
      </Card>
    </div>
  )
}
