'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Detalle colapsable del pedido: online = items reales con modificadores;
 * manual = línea-resumen "Pedido por teléfono" + nota del negocio destacada.
 */
export function OrderDetail({
  detail,
  defaultOpen = false,
}: {
  detail: OrderDetailResponse
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { order, items } = detail
  const count = items.reduce((n, i) => n + i.quantity, 0)
  const total = order.orderAmount + order.deliveryFee

  return (
    <div className="mt-3.5 rounded-[22px] border border-ink/5 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-[18px] py-4"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="t-eyebrow" style={{ marginBottom: 0 }}>
          Detalle del pedido
        </span>
        <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
          {count} {count === 1 ? 'producto' : 'productos'}
          <span
            aria-hidden
            className="inline-flex"
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(-90deg)',
              transition: 'transform 200ms ease',
            }}
          >
            <Icon.Back />
          </span>
        </span>
      </button>

      {open && (
        <div className="px-[18px] pb-4">
          {items.map((item) => (
            <div key={item.id} className="py-1">
              <div className="flex justify-between text-[14px] text-ink-muted">
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span className="tabular-nums">{soles(item.lineTotal)}</span>
              </div>
              {item.modifiers.map((m) => (
                <div
                  key={`${item.id}-${m.option}`}
                  className="mt-0.5 flex justify-between pl-5 text-[12px]"
                  style={{ color: 'rgba(26,22,20,0.5)' }}
                >
                  <span>{m.option}</span>
                  {m.additionalPrice > 0 && (
                    <span className="tabular-nums">+{soles(m.additionalPrice)}</span>
                  )}
                </div>
              ))}
              {/* En manuales el item sintético duplica business_notes: prima el panel. */}
              {item.note && item.note !== order.businessNotes && (
                <p
                  className="mt-0.5 pl-5 text-[12px] italic"
                  style={{ color: 'rgba(26,22,20,0.45)' }}
                >
                  “{item.note}”
                </p>
              )}
            </div>
          ))}

          {order.customerNotes && (
            <div
              className="mt-2 rounded-[12px] px-3 py-2 text-[13px]"
              style={{ background: 'rgba(26,22,20,0.04)' }}
            >
              Nota del cliente: {order.customerNotes}
            </div>
          )}
          {order.isManual && order.businessNotes && (
            <div
              className="mt-2 rounded-[14px] px-3.5 py-3 font-medium text-[14px]"
              style={{ background: 'rgba(249,115,22,0.08)', color: '#7C2D12' }}
            >
              {order.businessNotes}
            </div>
          )}

          <div className="my-2.5 h-px" style={{ background: 'rgba(26,22,20,0.08)' }} />
          <div className="flex justify-between py-0.5 text-[13px] text-ink-muted tabular-nums">
            <span>Productos</span>
            <span>{soles(order.orderAmount)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-[13px] text-ink-muted tabular-nums">
            <span>Delivery</span>
            <span>{soles(order.deliveryFee)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <span className="font-semibold text-[16px]">Total</span>
            <span className="t-display text-[18px] tabular-nums">{soles(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
