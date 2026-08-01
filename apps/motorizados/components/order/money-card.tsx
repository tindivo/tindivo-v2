'use client'

import { Badge, Card, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Lo que el motorizado tiene que hacer con el dinero, arriba del todo y sin
 * abrir nada. Antes esto vivía dentro del detalle colapsado: para saber si
 * cobraba —y cuánto— había que desplegar una tarjeta.
 */
export function MoneyCard({ detail }: { detail: OrderDetailResponse }) {
  const { order } = detail
  const total = order.orderAmount + order.deliveryFee
  const prepaid = order.paymentIntent === 'prepaid'
  const mixed = order.paymentIntent === 'pending_mixed'
  const yape = order.paymentIntent === 'pending_yape'

  return (
    <Card
      className="mt-3.5 overflow-hidden p-[18px]"
      style={
        prepaid
          ? undefined
          : { backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #fff8f3 100%)' }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="t-eyebrow">{prepaid ? 'Ya pagado' : 'Cobras al entregar'}</span>
          <p
            className={`t-display mt-1 text-[28px] leading-none tabular-nums ${
              prepaid ? 'text-success' : 'text-ink'
            }`}
          >
            {prepaid ? 'No cobrar' : soles(total)}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
          <Icon
            name={prepaid ? 'verified' : mixed ? 'account_balance_wallet' : 'payments'}
            size={22}
          />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {prepaid && (
          <Badge variant="success" size="sm">
            Prepago verificado
          </Badge>
        )}
        {yape && (
          <Badge variant="info" size="sm">
            Yape al recibir
          </Badge>
        )}
        {mixed && (
          <>
            <Badge variant="info" size="sm">
              Yape {soles(order.yapeAmount)}
            </Badge>
            <Badge variant="warning" size="sm">
              Efectivo {soles(order.cashAmount)}
            </Badge>
          </>
        )}
        {order.paymentIntent === 'pending_cash' && (
          <Badge variant="warning" size="sm">
            Efectivo
          </Badge>
        )}
      </div>

      {/* El vuelto es la causa número uno de volver al local con un problema. */}
      {order.changeToGive != null && order.changeToGive > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-[14px] bg-warning-soft px-3.5 py-3">
          <span className="flex items-center gap-2 text-[13px] font-medium text-amber-900">
            <Icon name="currency_exchange" size={18} />
            Paga con {soles(order.clientPaysWith)} · lleva vuelto
          </span>
          <span className="t-display text-[17px] tabular-nums text-amber-900">
            {soles(order.changeToGive)}
          </span>
        </div>
      )}
    </Card>
  )
}
