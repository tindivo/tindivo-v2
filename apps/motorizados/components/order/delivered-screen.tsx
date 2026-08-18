'use client'

import { Card, Icon } from '@tindivo/ui'
import { hourOf } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'
import { OrderDetail } from './order-detail'

/** Pantalla de entrega completada (modo lectura del historial). */
export function DeliveredScreen({
  detail,
}: {
  detail: OrderDetailResponse
  justDelivered?: boolean
}) {
  const { order } = detail

  // Modo lectura (desde el historial del turno).
  return (
    <div className="pb-6">
      <Card className="mt-2 flex items-center gap-3 p-[18px]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success text-white">
          <Icon name="check" size={20} />
        </span>
        <div>
          <p className="font-semibold text-body-lg">Entregado</p>
          <p className="text-caption text-ink-muted">
            {order.deliveredAt ? `Hoy a las ${hourOf(order.deliveredAt)}` : 'Completado'} ·{' '}
            {order.paymentReal === 'paid_cash'
              ? 'cobrado en efectivo'
              : order.paymentReal === 'paid_yape'
                ? 'cobrado por Yape'
                : 'pagado'}
          </p>
        </div>
      </Card>
      <OrderDetail detail={detail} defaultOpen />
    </div>
  )
}
