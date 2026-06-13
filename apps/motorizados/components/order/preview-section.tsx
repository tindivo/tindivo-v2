'use client'

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
          <span className="rounded-md bg-danger px-2 py-0.5 font-bold font-mono text-[10px] text-white uppercase">
            Vencido
          </span>
        ) : order.status === 'waiting_driver' ? (
          <span
            className="rounded-md px-2 py-0.5 font-bold font-mono text-[10px] uppercase"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#92400E' }}
          >
            Listo
          </span>
        ) : null}
      </div>

      <div className="mt-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
        <p className="t-eyebrow">Recoger en</p>
        <p className="mt-1 font-semibold text-[17px]">{business?.name ?? 'Restaurante'}</p>
        {business?.address && (
          <p className="mt-0.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {business.address}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
            Total a cobrar
          </span>
          <span className="t-display text-[22px] tabular-nums">{soles(total)}</span>
        </div>
        <p className="mt-1 text-[14px]">
          {PAYMENT_LABEL[order.paymentIntent] ?? order.paymentIntent}
        </p>
        {order.paymentIntent === 'pending_cash' &&
          order.changeToGive != null &&
          order.changeToGive > 0 && (
            <div
              className="mt-2 rounded-[14px] px-3.5 py-2.5 font-semibold text-[13px]"
              style={{ background: 'rgba(249,115,22,0.08)', color: '#C2410C' }}
            >
              Lleva vuelto: {soles(order.changeToGive)}
            </div>
          )}
      </div>
    </div>
  )
}
