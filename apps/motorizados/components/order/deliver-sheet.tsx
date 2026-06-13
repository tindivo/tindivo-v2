'use client'

import { BottomSheet } from '@tindivo/ui'
import { useState } from 'react'
import type { OrderDetailResponse } from '@/lib/types'

type PaymentReal = 'paid_cash' | 'paid_yape'

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
      ? 'paid_yape'
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
                className="rounded-[18px] p-4 text-left"
                style={
                  payment === p.value
                    ? { border: '2px solid #F97316', background: 'rgba(249,115,22,0.05)' }
                    : { border: '1px solid rgba(26,22,20,0.1)', background: '#fff' }
                }
              >
                <p className="font-semibold text-[15px]">{p.label}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                  {p.desc}
                </p>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="t-btn t-btn-primary t-btn-block mt-5"
          disabled={!payment || busy}
          onClick={() => payment && onConfirm(payment)}
        >
          {busy ? 'Confirmando…' : 'Confirmar entrega'}
        </button>

        <div className="mt-5 border-ink/10 border-t pt-4">
          {!noShowArmed ? (
            <button
              type="button"
              className="text-[13px] text-danger underline"
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
                <button
                  type="button"
                  className="t-btn flex-1 text-white"
                  style={{ background: '#DC2626', padding: '12px 16px', fontSize: 14 }}
                  disabled={busy}
                  onClick={onNoShow}
                >
                  Sí, reportar no-show
                </button>
                <button
                  type="button"
                  className="t-btn t-btn-ghost"
                  style={{ padding: '12px 16px', fontSize: 14 }}
                  onClick={() => setNoShowArmed(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
