'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import { needsRecheck } from '@/lib/orders/door-payment'
import { useDoorPayment } from '@/lib/orders/use-door-payment'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'
import { PaymentProofViewer } from './payment-proof-viewer'
import { YapeQr } from './yape-qr'

/**
 * El cobro, con el cliente delante: efectivo + vuelto, QR del negocio, o nada.
 *
 * EL VUELTO SE DERIVA, NO SE LEE DE LA COLUMNA.
 * Las dos ramas de esta tarjeta lo condicionaban a `order.changeToGive != null`,
 * y esa columna llega SIEMPRE NULL en los pedidos manuales —el 100% del
 * piloto— porque `create_business_manual_order` calcula el vuelto, lo devuelve
 * en su respuesta y nunca lo escribe. O sea: la pantalla que se mira con el
 * dinero en la mano no decía cuánto devolver. Es el mismo defecto que
 * `lib/payment.ts` documenta y que la tarjeta del board ya tenía resuelto.
 *
 * Aquí importaba más que en ningún otro sitio: en la tarjeta el vuelto es un
 * aviso, y aquí es la instrucción.
 */
export function CollectCard({ detail }: { detail: OrderDetailResponse }) {
  const { order, business } = detail
  // Pago único: el negocio pudo confirmar el ingreso, y solo él lo confirma. El
  // hook relee para que la tarjeta no siga mostrando el QR si ya lo confirmó.
  const { door, checkFailed } = useDoorPayment(order, { pollMs: 20000 })
  const total = order.orderAmount + order.deliveryFee

  const vuelto = changeDue({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  if (order.paymentIntent === 'prepaid') {
    return (
      <Card className="mt-3 flex items-center gap-2.5 border-none bg-success-soft p-4 text-success shadow-none">
        <Icon name="check" size={20} />
        <span className="font-semibold text-body">Pedido ya pagado. No cobres nada.</span>
      </Card>
    )
  }

  if (order.paymentIntent === 'pending_cash') {
    return (
      <Card className="mt-3 p-[18px]">
        <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Cobro en efectivo
        </p>
        <div className="mt-2 flex justify-between py-1 text-body tabular-nums text-ink-muted">
          <span>Cobrar</span>
          <span className="font-semibold text-ink">{soles(total)}</span>
        </div>
        {order.clientPaysWith != null && (
          <div className="flex justify-between py-1 text-body tabular-nums text-ink-muted">
            <span>Paga con</span>
            <span>{soles(order.clientPaysWith)}</span>
          </div>
        )}
        {vuelto != null && vuelto > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-xl bg-warning-soft px-3 py-2 tabular-nums">
            <span className="text-body font-medium text-amber-900">Vuelto</span>
            <span className="font-mono text-lead font-bold text-amber-900">{soles(vuelto)}</span>
          </div>
        )}
      </Card>
    )
  }

  if (door.mode === 'confirmed_by_business') {
    return (
      <Card className="mt-3 flex items-center gap-2.5 border-none bg-success-soft p-4 text-success shadow-none">
        <Icon name="check" size={20} />
        <span className="font-semibold text-body">
          El restaurante ya confirmó el pago. No cobres nada.
        </span>
      </Card>
    )
  }
  const isSingle = needsRecheck(order)

  // pending_yape | pending_mixed: el cliente paga al Yape del restaurante.
  return (
    <Card className="mt-3 p-[18px]">
      {isSingle && checkFailed && (
        <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-body font-semibold text-amber-900">
          No pudimos comprobar si el restaurante ya confirmó el pago. Llama al restaurante antes de
          cobrar; si no contesta, cobra con el QR.
        </p>
      )}
      {isSingle && door.proof === 'rejected' && (
        <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-body font-semibold text-amber-900">
          El restaurante rechazó la captura. Cobra en la puerta.
        </p>
      )}
      {isSingle && (door.proof === 'pending' || door.proof === 'verified') && (
        <div className="mb-3 rounded-xl bg-surface px-3 py-2.5">
          <p className="text-body font-semibold text-ink">El cliente envió su captura</p>
          <p className="mt-0.5 text-caption text-ink-muted">
            Mientras el restaurante no lo confirme, cobra con el QR.
          </p>
          <div className="mt-2">
            <PaymentProofViewer orderId={order.id} />
          </div>
        </div>
      )}
      <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
        El cliente paga al Yape del restaurante
      </p>
      {/* Mismo QR que en la hoja de entrega: a pantalla completa de un toque, y
          con caída al número si el local no tiene imagen cargada. Antes eran
          180px fijos — suficiente para verlo, corto para que lo escanee un
          móvil ajeno de noche. */}
      <div className="mt-3">
        <YapeQr
          qrs={business?.paymentQrs}
          fallbackNumber={business?.yapeNumber}
          businessName={business?.name}
          amount={order.paymentIntent === 'pending_mixed' ? (order.yapeAmount ?? total) : total}
        />
      </div>
      {order.paymentIntent === 'pending_mixed' && (
        <div className="mt-3 border-t border-ink/10 pt-2">
          <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Desglose
          </p>
          <div className="flex justify-between py-1 text-body tabular-nums text-ink-muted">
            <span>Por Yape</span>
            <span className="font-semibold text-ink">{soles(order.yapeAmount)}</span>
          </div>
          <div className="flex justify-between py-1 text-body tabular-nums text-ink-muted">
            <span>En efectivo</span>
            <span className="font-semibold text-ink">{soles(order.cashAmount)}</span>
          </div>
          {vuelto != null && vuelto > 0 && (
            <div className="mt-1 flex items-center justify-between rounded-xl bg-warning-soft px-3 py-2 tabular-nums">
              <span className="text-body font-medium text-amber-900">Vuelto</span>
              <span className="font-mono text-lead font-bold text-amber-900">{soles(vuelto)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
