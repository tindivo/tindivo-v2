'use client'

import { Card, cn, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import { moneyLine } from '@/lib/orders/presentation'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Lo que el motorizado tiene que hacer con el dinero, arriba del todo y sin
 * abrir nada.
 *
 * EL VUELTO NO SE LEÍA DE LA COLUMNA, Y POR ESO NO SE VEÍA NUNCA.
 * Este bloque estaba condicionado a `order.changeToGive != null && > 0`, y esa
 * columna llega SIEMPRE NULL en los pedidos manuales —el 100% del piloto—
 * porque `create_business_manual_order` calcula el vuelto, lo devuelve en su
 * respuesta y nunca lo escribe. O sea: el dato que `lib/payment.ts` describe
 * como «la causa número uno de volver al local con un problema» no aparecía en
 * la pantalla donde se cobra. La tarjeta del board ya lo derivaba bien con
 * `changeDue()`; aquí faltaba.
 *
 * Ahora la cifra y el método salen de `presentation.ts`, el mismo módulo que la
 * tarjeta, y el vuelto se deriva. Dos copias de una regla divergen.
 */
export function MoneyCard({ detail }: { detail: OrderDetailResponse }) {
  const { order } = detail
  const total = order.orderAmount + order.deliveryFee
  const prepaid = order.paymentIntent === 'prepaid'

  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  const vuelto = changeDue({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  return (
    <Card className="mt-3.5 overflow-hidden p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {prepaid ? 'Ya pagado' : 'Cobras al entregar'}
          </span>
          {/* Misma jerarquía que la tarjeta: la cifra grande y debajo el
              método. Aquí cabe más cuerpo porque es la pantalla del momento. */}
          <p
            className={cn(
              'mt-1 font-mono font-bold text-display leading-none tracking-tight tabular-nums',
              prepaid ? 'text-success' : 'text-ink',
            )}
          >
            {money.headline}
          </p>
          {money.detail && (
            <p
              className={cn(
                'mt-1.5 text-caption font-medium',
                prepaid ? 'text-success' : 'text-ink-muted',
              )}
            >
              {money.detail}
            </p>
          )}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
          <Icon name={prepaid ? 'verified' : 'payments'} size={22} />
        </span>
      </div>

      {/* El vuelto repetido y en grande, a propósito: es el único número que el
          motorizado tiene que llevar ENCIMA antes de salir, y el que le hace
          volver al local si falla. En la tarjeta cabe en la línea del método;
          aquí, que es la pantalla donde se cobra, se gana su propia caja. */}
      {vuelto != null && vuelto > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-[14px] bg-warning-soft px-3.5 py-3">
          <span className="flex items-center gap-2 text-caption font-medium text-amber-900">
            <Icon name="currency_exchange" size={18} />
            Paga con {soles(order.clientPaysWith)} · lleva vuelto
          </span>
          <span className="font-mono text-lead font-bold tracking-tight tabular-nums text-amber-900">
            {soles(vuelto)}
          </span>
        </div>
      )}
    </Card>
  )
}
