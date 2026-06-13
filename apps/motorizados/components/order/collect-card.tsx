'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/** Card de cobro según método: efectivo+vuelto / QR Yape del negocio / prepago. */
export function CollectCard({ detail }: { detail: OrderDetailResponse }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee

  if (order.paymentIntent === 'prepaid') {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-[18px] bg-success/10 px-4 py-3.5 text-success">
        <Icon.Check />
        <span className="font-semibold text-[14px]">Pedido ya pagado. No cobres nada.</span>
      </div>
    )
  }

  if (order.paymentIntent === 'pending_cash') {
    return (
      <div className="mt-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
        <p className="t-eyebrow">Cobro en efectivo</p>
        <div className="mt-2 flex justify-between py-1 text-[14px] tabular-nums">
          <span style={{ color: 'rgba(26,22,20,0.6)' }}>Cobrar</span>
          <span className="font-semibold">{soles(total)}</span>
        </div>
        {order.clientPaysWith != null && (
          <div className="flex justify-between py-1 text-[14px] tabular-nums">
            <span style={{ color: 'rgba(26,22,20,0.6)' }}>Paga con</span>
            <span>{soles(order.clientPaysWith)}</span>
          </div>
        )}
        {order.changeToGive != null && (
          <div className="flex justify-between py-1 tabular-nums">
            <span className="text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
              Vuelto
            </span>
            <span className="font-bold text-[16px]" style={{ color: '#C2410C' }}>
              {soles(order.changeToGive)}
            </span>
          </div>
        )}
      </div>
    )
  }

  // pending_yape | pending_mixed: el cliente paga al Yape del restaurante.
  return (
    <div className="mt-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
      <p className="t-eyebrow">El cliente paga al Yape del restaurante</p>
      {business?.qrUrl && (
        <div className="mt-3 flex justify-center">
          <img
            src={business.qrUrl}
            alt={`QR de Yape de ${business.name}`}
            className="rounded-2xl"
            style={{
              width: 180,
              height: 180,
              objectFit: 'contain',
              border: '1px solid rgba(26,22,20,0.08)',
              background: '#fff',
            }}
          />
        </div>
      )}
      {business?.yapeNumber && (
        <p className="mt-2 text-center font-mono font-semibold text-[22px]">
          {business.yapeNumber}
        </p>
      )}
      {order.paymentIntent === 'pending_mixed' && (
        <div className="mt-3 border-ink/10 border-t pt-2">
          <div className="flex justify-between py-1 text-[14px] tabular-nums">
            <span style={{ color: 'rgba(26,22,20,0.6)' }}>Por Yape</span>
            <span className="font-semibold">{soles(order.yapeAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-[14px] tabular-nums">
            <span style={{ color: 'rgba(26,22,20,0.6)' }}>En efectivo</span>
            <span className="font-semibold">{soles(order.cashAmount)}</span>
          </div>
          {order.changeToGive != null && order.changeToGive > 0 && (
            <div className="flex justify-between py-1 tabular-nums">
              <span className="text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
                Vuelto
              </span>
              <span className="font-bold text-[16px]" style={{ color: '#C2410C' }}>
                {soles(order.changeToGive)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
