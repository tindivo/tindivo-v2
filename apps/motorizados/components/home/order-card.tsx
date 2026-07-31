'use client'

import { Badge, Card } from '@tindivo/ui'
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
  const total = order.order_amount + order.delivery_fee
  const step = MINE_STEPS[order.status]
  // Un pedido en cocción todavía no es accionable: la tarjeta no navega ni
  // responde al toque, como en producción. La señal de "aún no" tiene que ser
  // evidente antes de tocar, no después.
  const isUpcoming = variant === 'upcoming'

  return (
    <Card
      as={isUpcoming ? 'div' : 'button'}
      {...(isUpcoming ? { 'aria-disabled': true } : { type: 'button' as const })}
      onClick={isUpcoming ? undefined : () => router.push(`/pedido/${order.id}`)}
      className={`block w-full p-4 text-left ${
        isUpcoming ? 'cursor-default' : 'transition-transform active:scale-[0.99]'
      } ${URGENCY_CARD[urgency]} ${
        // Acento gris, no el del restaurante: señal de "no accionable aún".
        isUpcoming ? 'border-l-4 border-l-ink/20 opacity-60' : ''
      } ${dimmed && !isUpcoming ? 'opacity-60' : ''} ${
        variant === 'delivered' ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] font-semibold text-ink">#{order.short_id}</span>
        <span className="flex items-center gap-1.5">
          <SourceChip source={order.source} />
          {variant === 'available' && urgency === 'overdue' && (
            <Badge variant="danger" size="sm">
              Vencido
            </Badge>
          )}
          {variant === 'available' && urgency === 'ready' && (
            <Badge variant="warning" size="sm">
              Listo
            </Badge>
          )}
          {/* La cajera confirmó que la comida ya salió de cocina. Pesa más que
              el resto de distintivos: es la diferencia entre ir y esperar. */}
          {variant !== 'delivered' && order.ready_early_used && (
            <Badge variant="success" size="sm">
              Comida lista
            </Badge>
          )}
          {variant === 'delivered' && (
            <Badge variant="success" size="sm">
              Entregado
            </Badge>
          )}
        </span>
      </div>

      <p className="mt-1.5 text-[16px] font-semibold">{order.businesses?.name ?? 'Restaurante'}</p>
      <p className="truncate text-[13px] text-ink-muted">
        {order.customer_name ?? 'Cliente'}
        {(order.delivery_reference ?? order.delivery_address) &&
          ` · ${order.delivery_reference ?? order.delivery_address}`}
      </p>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="t-display text-[18px] tabular-nums">{soles(total)}</span>
        <span className="text-[12px] font-medium text-ink-muted">
          {PAYMENT_LABEL[order.payment_intent] ?? order.payment_intent}
          {order.payment_intent === 'pending_cash' &&
            order.change_to_give != null &&
            order.change_to_give > 0 && (
              <span className="text-brand-dark"> · vuelto {soles(order.change_to_give)}</span>
            )}
        </span>
      </div>

      {variant === 'mine' && step && (
        <div className="mt-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step.idx ? 'bg-brand' : 'bg-ink/10'}`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">{step.label}</p>
        </div>
      )}

      {isUpcoming && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-ink-subtle">
            {order.estimated_ready_at
              ? `En preparación · listo en ~${Math.max(
                  1,
                  Math.round((Date.parse(order.estimated_ready_at) - now) / 60_000),
                )} min`
              : 'En preparación'}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-ink-subtle">
            No aceptable aún
          </span>
        </div>
      )}

      {variant === 'delivered' && order.delivered_at && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">{hourOf(order.delivered_at)}</p>
      )}
    </Card>
  )
}
