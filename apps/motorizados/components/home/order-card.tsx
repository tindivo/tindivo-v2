'use client'

import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { hourOf, PAYMENT_LABEL, soles } from '@/lib/format'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency, URGENCY_CARD } from '@/lib/urgency'

const MINE_STEPS: Record<string, { idx: number; label: string }> = {
  heading_to_restaurant: { idx: 0, label: 'Voy al local' },
  waiting_at_restaurant: { idx: 1, label: 'En el local' },
  picked_up: { idx: 2, label: 'En camino' },
}

/** Card compacta del board: toda clickeable, navega al detalle del pedido. */
export function OrderCard({
  order,
  now,
  variant = 'available',
  dimmed = false,
}: {
  order: BoardOrder
  now: number
  variant?: 'available' | 'mine' | 'upcoming' | 'delivered'
  dimmed?: boolean
}) {
  const router = useRouter()
  const urgency = variant === 'available' ? orderUrgency(order, now) : 'normal'
  const cardCls = variant === 'available' ? URGENCY_CARD[urgency] : 'border border-ink/5 bg-white'
  const total = order.order_amount + order.delivery_fee
  const step = MINE_STEPS[order.status]

  return (
    <button
      type="button"
      onClick={() => router.push(`/pedido/${order.id}`)}
      className={`block w-full rounded-[22px] p-4 text-left transition-transform active:scale-[0.99] ${cardCls} ${
        dimmed || variant === 'upcoming' ? 'opacity-60' : ''
      } ${variant === 'delivered' ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-[12px] text-ink">#{order.short_id}</span>
        <span className="flex items-center gap-1.5">
          <SourceChip source={order.source} />
          {variant === 'available' && urgency === 'overdue' && (
            <span className="rounded-md bg-danger px-2 py-0.5 font-bold font-mono text-[10px] text-white uppercase">
              Vencido
            </span>
          )}
          {variant === 'available' && urgency === 'ready' && (
            <span
              className="rounded-md px-2 py-0.5 font-bold font-mono text-[10px] uppercase"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#92400E' }}
            >
              Listo
            </span>
          )}
          {variant === 'delivered' && (
            <span className="rounded-md bg-success/10 px-2 py-0.5 font-bold font-mono text-[10px] text-success uppercase">
              Entregado
            </span>
          )}
        </span>
      </div>

      <p className="mt-1.5 font-semibold text-[16px]">{order.businesses?.name ?? 'Restaurante'}</p>
      <p className="truncate text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
        {order.customer_name ?? 'Cliente'}
        {(order.delivery_reference ?? order.delivery_address) &&
          ` · ${order.delivery_reference ?? order.delivery_address}`}
      </p>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="t-display text-[18px] tabular-nums">{soles(total)}</span>
        <span className="font-medium text-[12px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          {PAYMENT_LABEL[order.payment_intent] ?? order.payment_intent}
          {order.payment_intent === 'pending_cash' &&
            order.change_to_give != null &&
            order.change_to_give > 0 && (
              <span style={{ color: '#C2410C' }}> · vuelto {soles(order.change_to_give)}</span>
            )}
        </span>
      </div>

      {variant === 'mine' && step && (
        <div className="mt-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{ background: i <= step.idx ? '#F97316' : 'rgba(26,22,20,0.1)' }}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {step.label}
          </p>
        </div>
      )}

      {variant === 'upcoming' && order.appears_in_queue_at && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">
          Entra a la cola en ~
          {Math.max(1, Math.round((Date.parse(order.appears_in_queue_at) - now) / 60_000))} min
        </p>
      )}

      {variant === 'delivered' && order.delivered_at && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">{hourOf(order.delivered_at)}</p>
      )}
    </button>
  )
}
