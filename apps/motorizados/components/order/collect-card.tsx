'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/** Card de cobro según método: efectivo+vuelto / QR Yape del negocio / prepago. */
export function CollectCard({ detail }: { detail: OrderDetailResponse }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee

  if (order.paymentIntent === 'prepaid') {
    return (
      <Card className="mt-3 flex items-center gap-2.5 border-none bg-success-soft p-4 text-success shadow-none">
        <Icon name="check" size={20} />
        <span className="font-semibold text-[14px]">Pedido ya pagado. No cobres nada.</span>
      </Card>
    )
  }

  if (order.paymentIntent === 'pending_cash') {
    return (
      <Card className="mt-3 p-[18px]">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          Cobro en efectivo
        </p>
        <div className="mt-2 flex justify-between py-1 text-[14px] tabular-nums text-ink-muted">
          <span>Cobrar</span>
          <span className="font-semibold text-ink">{soles(total)}</span>
        </div>
        {order.clientPaysWith != null && (
          <div className="flex justify-between py-1 text-[14px] tabular-nums text-ink-muted">
            <span>Paga con</span>
            <span>{soles(order.clientPaysWith)}</span>
          </div>
        )}
        {order.changeToGive != null && (
          <div className="flex justify-between py-1 tabular-nums">
            <span className="text-[14px] text-ink-muted">Vuelto</span>
            <span className="text-[16px] font-bold text-brand-dark">
              {soles(order.changeToGive)}
            </span>
          </div>
        )}
      </Card>
    )
  }

  // pending_yape | pending_mixed: el cliente paga al Yape del restaurante.
  return (
    <Card className="mt-3 p-[18px]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
        El cliente paga al Yape del restaurante
      </p>
      {business?.qrUrl && (
        <div className="mt-3 flex justify-center">
          <img
            src={business.qrUrl}
            alt={`QR de Yape de ${business.name}`}
            className="h-[180px] w-[180px] rounded-2xl border border-ink/[0.08] bg-card object-contain shadow-elev-1"
          />
        </div>
      )}
      {business?.yapeNumber && (
        <>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-ink/55">
            Número de Yape
          </p>
          <p className="text-center font-mono text-[22px] font-semibold">{business.yapeNumber}</p>
        </>
      )}
      {order.paymentIntent === 'pending_mixed' && (
        <div className="mt-3 border-t border-ink/10 pt-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
            Desglose
          </p>
          <div className="flex justify-between py-1 text-[14px] tabular-nums text-ink-muted">
            <span>Por Yape</span>
            <span className="font-semibold text-ink">{soles(order.yapeAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-[14px] tabular-nums text-ink-muted">
            <span>En efectivo</span>
            <span className="font-semibold text-ink">{soles(order.cashAmount)}</span>
          </div>
          {order.changeToGive != null && order.changeToGive > 0 && (
            <div className="flex justify-between py-1 tabular-nums">
              <span className="text-[14px] text-ink-muted">Vuelto</span>
              <span className="text-[16px] font-bold text-brand-dark">
                {soles(order.changeToGive)}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
