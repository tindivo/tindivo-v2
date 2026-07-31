'use client'

import { BottomSheet, Button } from '@tindivo/ui'
import { useState } from 'react'
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

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="t-display text-[20px]">
          {prepaid ? 'Confirmar entrega' : '¿Cómo pagó el cliente?'}
        </h2>
        {prepaid && <p className="t-muted mt-1 text-[14px]">Este pedido ya estaba pagado.</p>}

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
                    ? 'border-2 border-brand bg-brand/5'
                    : 'border border-ink/10 bg-card hover:bg-surface'
                }`}
              >
                <p className="font-semibold text-[15px] text-ink">{p.label}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">{p.desc}</p>
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
            <button
              type="button"
              className="text-[13px] text-danger underline transition-colors hover:text-danger/80"
              onClick={() => setNoShowArmed(true)}
            >
              El cliente no apareció
            </button>
          ) : (
            <div>
              <p className="t-muted text-[13px]">
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
