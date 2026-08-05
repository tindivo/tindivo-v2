'use client'

import { Card, Icon } from '@tindivo/ui'
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
    <Card className="mt-3.5 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-[18px] py-4"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          Detalle del pedido
        </span>
        <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
          {/* Los manuales no traen líneas: "0 productos" sonaba a pedido vacío. */}
          {count === 0
            ? order.isManual
              ? 'Pedido por teléfono'
              : 'Sin detalle'
            : `${count} ${count === 1 ? 'producto' : 'productos'}`}
          <span
            aria-hidden
            className={`inline-flex transition-transform duration-200 ${
              open ? 'rotate-90' : '-rotate-90'
            }`}
          >
            <Icon name="arrow_back" size={20} />
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
                  className="mt-0.5 flex justify-between pl-5 text-[12px] text-ink-subtle"
                >
                  <span>{m.option}</span>
                  {m.additionalPrice > 0 && (
                    <span className="tabular-nums">+{soles(m.additionalPrice)}</span>
                  )}
                </div>
              ))}
              {/* En manuales el item sintético duplica business_notes: prima el panel. */}
              {item.note && item.note !== order.businessNotes && (
                <p className="mt-0.5 pl-5 text-[12px] italic text-ink-subtle">“{item.note}”</p>
              )}
            </div>
          ))}

          {order.customerNotes && (
            <div className="mt-2 rounded-[12px] bg-ink/[0.04] px-3 py-2 text-[13px]">
              Nota del cliente: {order.customerNotes}
            </div>
          )}
          {order.isManual && order.businessNotes && (
            <div className="mt-2 rounded-[14px] bg-brand/10 px-3.5 py-3 text-[14px] font-medium text-brand-dark">
              {order.businessNotes}
            </div>
          )}

          <div className="my-2.5 h-px bg-ink/[0.08]" />
          <div className="flex justify-between py-0.5 text-[13px] tabular-nums text-ink-muted">
            <span>Productos</span>
            <span>{soles(order.orderAmount)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-[13px] tabular-nums text-ink-muted">
            <span>Delivery</span>
            <span>{soles(order.deliveryFee)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <span className="font-semibold text-[16px]">Total</span>
            <span className="font-display text-[18px] font-bold tracking-tight tabular-nums">
              {soles(total)}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}
