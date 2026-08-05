'use client'

import { Card, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/features/checkout/lib/format'
import { useCart } from '@/lib/cart'

export function OrderDetail() {
  const cart = useCart()
  const [open, setOpen] = useState(true)
  const count = cart.count()
  if (count === 0) return null

  return (
    <Card className="mt-5 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-low">
          <Icon name="shopping_bag" size={20} />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-[15px] text-ink">Detalle del pedido</span>
          <span className="block text-[12px] text-ink-muted">
            {cart.businessName ? `${cart.businessName} · ` : ''}
            {count} {count === 1 ? 'producto' : 'productos'}
          </span>
        </span>
        <span
          aria-hidden
          className={`inline-flex text-ink-subtle transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <Icon name="expand_more" size={20} />
        </span>
      </button>

      {open && (
        <div className="border-t border-ink/[0.04] px-4 pb-4">
          {cart.lines.map((line) => (
            <div
              key={line.key}
              className="flex items-start gap-3 border-t border-ink/[0.04] pt-3.5 first:border-t-0 first:pt-0"
            >
              {/* Placeholder de color por `hue` (mismo estándar visual que el modal de producto). */}
              <span
                aria-hidden
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.92_0.04_${line.hue})] text-[oklch(0.42_0.12_${line.hue})] text-[18px] font-bold`}
              >
                {line.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-[14px] leading-snug">
                    <span className="tabular-nums">{line.quantity}×</span> {line.name}
                  </div>
                  <div className="shrink-0 font-semibold text-[14px] tabular-nums">
                    {soles(line.unitPrice * line.quantity)}
                  </div>
                </div>

                {line.modifiers.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {line.modifiers.map((m) => (
                      <div
                        key={`${line.key}-${m.optionId}`}
                        className="flex justify-between gap-2 text-[12px] text-ink-muted"
                      >
                        <span className="min-w-0">
                          <span className="text-ink-subtle">{m.groupName}: </span>
                          {m.optionName}
                        </span>
                        {m.price > 0 && (
                          <span className="shrink-0 tabular-nums">+{soles(m.price)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {line.note && (
                  <div className="mt-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-dark">
                    <span className="font-semibold">Nota: </span>
                    {line.note}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between">
                  <div className="inline-flex origin-left scale-90 items-center rounded-full bg-ink/[0.06] p-1">
                    <button
                      type="button"
                      onClick={() => cart.setQty(line.key, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label="Menos"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95 disabled:opacity-50"
                    >
                      <Icon name="remove" size={20} />
                    </button>
                    <span className="min-w-7 text-center font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.setQty(line.key, line.quantity + 1)}
                      aria-label="Más"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95"
                    >
                      <Icon name="add" size={20} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.remove(line.key)}
                    className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-3 py-1.5 font-semibold text-[12px] text-danger transition-colors hover:bg-danger/10"
                  >
                    <Icon name="delete" size={14} /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
