'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * "Vas a necesitar sencillo", y solo mientras estás EN EL LOCAL.
 *
 * De todo lo que dice el cobro, esto es lo ÚNICO accionable estando en el
 * mostrador: el restaurante es el único punto del recorrido donde se puede
 * cambiar un billete. Enterarse en la puerta del cliente ya no sirve de nada —
 * ahí solo queda volver, que es exactamente lo que `lib/payment.ts` describe
 * como «la causa número uno de volver al local con un problema».
 *
 * Por eso el resto del cobro no se pinta en este momento y esto sí: la pantalla
 * de cada paso enseña lo que ese paso permite hacer.
 */
export function ChangeHeadsUp({ detail }: { detail: OrderDetailResponse }) {
  const { order } = detail

  const vuelto = changeDue({
    paymentIntent: order.paymentIntent,
    total: order.orderAmount + order.deliveryFee,
    cashAmount: order.cashAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  if (vuelto == null || vuelto <= 0) return null

  return (
    <Card className="mt-3.5 flex items-center gap-3 border border-warning/30 bg-warning-soft p-[18px] shadow-none">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70 text-amber-900">
        <Icon name="currency_exchange" size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-amber-900">Lleva {soles(vuelto)} de vuelto</p>
        <p className="mt-0.5 text-caption text-amber-900">
          Paga con {soles(order.clientPaysWith)}. Consíguelo aquí, antes de salir.
        </p>
      </div>
    </Card>
  )
}
