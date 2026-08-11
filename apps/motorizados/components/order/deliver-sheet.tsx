'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { moneyLine } from '@/lib/orders/presentation'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Cómo pagó el cliente REALMENTE. `paid_prepaid` no se elige: se deduce de que
 * el pedido ya venía pagado. Registrarlo importa — si un prepago entregado se
 * guardara como `paid_yape`, sería indistinguible de un Yape cobrado en la
 * puerta, y ese es justo el número que hace falta para saber si la regla de
 * "primer pedido obligatoriamente prepago" está costando clientes.
 */
type PaymentReal = 'paid_prepaid' | 'paid_cash' | 'paid_yape'

/** Confirmación de entrega: cómo pagó el cliente + no-show en 2 pasos (HU-D-029). */
export function DeliverSheet({
  detail,
  busy,
  onConfirm,
  onNoShow,
  onClose,
}: {
  detail: OrderDetailResponse
  busy: boolean
  onConfirm: (paymentReal: PaymentReal) => void
  onNoShow: () => void
  onClose: () => void
}) {
  const { order } = detail
  const prepaid = order.paymentIntent === 'prepaid'
  const [payment, setPayment] = useState<PaymentReal | null>(
    prepaid
      ? 'paid_prepaid'
      : order.paymentIntent === 'pending_cash'
        ? 'paid_cash'
        : order.paymentIntent === 'pending_yape'
          ? 'paid_yape'
          : null, // mixto: obliga a elegir cómo terminó pagando
  )
  const [noShowArmed, setNoShowArmed] = useState(false)

  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total: order.orderAmount + order.deliveryFee,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight">
          {prepaid ? 'Confirmar entrega' : '¿Cómo pagó el cliente?'}
        </h2>
        {prepaid && <p className="mt-1 text-body text-ink-muted">Este pedido ya estaba pagado.</p>}

        {/* LA CIFRA, AQUÍ TAMBIÉN. Esta hoja preguntaba cómo pagó sin decir
            cuánto, y se abre con el cliente delante: para comprobar el importe
            había que cerrarla. En un mixto era peor — hay que elegir por qué vía
            terminó pagando sin el desglose a la vista. */}
        {!prepaid && (
          <div className="mt-3 rounded-[16px] bg-ink/[0.04] px-4 py-3">
            <p className="font-mono text-title font-bold leading-none tabular-nums text-ink">
              {money.headline}
            </p>
            {money.detail && (
              <p className="mt-1 text-caption font-medium text-ink-muted">{money.detail}</p>
            )}
          </div>
        )}

        {!prepaid && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {(
              [
                { value: 'paid_cash', label: 'Efectivo', desc: 'Billetes / monedas' },
                { value: 'paid_yape', label: 'Yape', desc: 'Al Yape del local' },
              ] as const
            ).map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPayment(p.value)}
                className={`rounded-[18px] p-4 text-left transition-colors ${
                  payment === p.value
                    ? 'border border-brand bg-brand/5 ring-2 ring-brand'
                    : 'border border-ink/10 bg-card hover:bg-surface'
                }`}
              >
                <p className="font-semibold text-body-lg text-ink">{p.label}</p>
                <p className="mt-0.5 text-caption text-ink-muted">{p.desc}</p>
              </button>
            ))}
          </div>
        )}

        <Button
          className="mt-5 w-full"
          disabled={!payment || busy}
          onClick={() => payment && onConfirm(payment)}
        >
          {busy ? 'Confirmando…' : 'Confirmar entrega'}
        </Button>

        <div className="mt-5 border-t border-ink/10 pt-4">
          {!noShowArmed ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-5 w-full"
              onClick={() => setNoShowArmed(true)}
            >
              <Icon name="report_problem" size={20} />
              El cliente no apareció
            </Button>
          ) : (
            <div>
              <p className="text-caption text-ink-muted">
                Espera 5 min e intenta contactar. Reportar genera un strike al cliente.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="danger" className="flex-1" disabled={busy} onClick={onNoShow}>
                  Sí, reportar no-show
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setNoShowArmed(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
