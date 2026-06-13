'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { hourOf, soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'
import { OrderDetail } from './order-detail'

/** Pantalla de entrega completada (recién entregado o modo lectura del historial). */
export function DeliveredScreen({
  detail,
  justDelivered,
}: {
  detail: OrderDetailResponse
  justDelivered: boolean
}) {
  const { order } = detail
  const total = order.orderAmount + order.deliveryFee
  const cash = order.paymentReal === 'paid_cash' || order.paymentIntent === 'pending_cash'

  if (justDelivered) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full text-white"
            style={{ background: '#1A8050' }}
          >
            <Icon.Check style={{ width: 36, height: 36 }} />
          </span>
          <p className="t-eyebrow mt-5 text-success" style={{ marginBottom: 0 }}>
            Pedido #{order.shortId}
          </p>
          <h1 className="t-display mt-1.5 text-[26px]">¡Entregado!</h1>
          <p className="t-muted mt-2 max-w-[300px] text-[14px]">
            {cash
              ? `Recuerda: llevas ${soles(total)} en efectivo para liquidar hoy.`
              : 'Buen trabajo. Vuelve al inicio para tomar otro pedido.'}
          </p>
        </div>
        <div className="pb-8">
          <Link href="/" className="t-btn t-btn-primary t-btn-block">
            Volver al inicio
          </Link>
        </div>
      </main>
    )
  }

  // Modo lectura (desde el historial del turno).
  return (
    <div className="pb-6">
      <div className="mt-2 flex items-center gap-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: '#1A8050' }}
        >
          <Icon.Check />
        </span>
        <div>
          <p className="font-semibold text-[16px]">Entregado</p>
          <p className="text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {order.deliveredAt ? `Hoy a las ${hourOf(order.deliveredAt)}` : 'Completado'} ·{' '}
            {order.paymentReal === 'paid_cash'
              ? 'cobrado en efectivo'
              : order.paymentReal === 'paid_yape'
                ? 'cobrado por Yape'
                : 'pagado'}
          </p>
        </div>
      </div>
      <OrderDetail detail={detail} defaultOpen />
    </div>
  )
}
