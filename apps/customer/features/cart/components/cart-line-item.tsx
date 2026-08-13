'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/features/cart/lib/format'
import { type CartLine, useCart } from '@/lib/cart'

interface CartLineItemProps {
  line: CartLine
  isFirst: boolean
}

export function CartLineList({ lines }: { lines: CartLine[] }) {
  return (
    <div className="flex flex-col">
      {lines.map((line, index) => (
        <CartLineItem key={line.key} line={line} isFirst={index === 0} />
      ))}
    </div>
  )
}

export function CartLineItem({ line, isFirst }: CartLineItemProps) {
  const cart = useCart()

  return (
    <div
      className={`flex items-start gap-3 pt-3.5 ${!isFirst ? 'mt-3.5 border-t border-ink/[0.04]' : ''}`}
    >
      {line.imageUrl ? (
        <img
          src={line.imageUrl}
          alt={line.name}
          decoding="async"
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-[18px]"
          style={{
            background: `oklch(0.92 0.04 ${line.hue})`,
            color: `oklch(0.42 0.12 ${line.hue})`,
          }}
        >
          {line.name.charAt(0).toUpperCase()}
        </span>
      )}

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
              <div key={`${line.key}-${m.optionId}`} className="text-[12px] text-ink-muted">
                <span className="text-ink-subtle">{m.groupName}: </span>
                {m.optionName}
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
          <div className="origin-left scale-90">
            <div className="inline-flex items-center rounded-full bg-ink/[0.06] p-1">
              <button
                type="button"
                onClick={() => cart.setQty(line.key, line.quantity - 1)}
                disabled={line.quantity <= 1}
                aria-label="Menos"
                className="h-8 w-8 rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95 disabled:opacity-50"
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
                className="h-8 w-8 rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95"
              >
                <Icon name="add" size={20} />
              </button>
            </div>
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
  )
}
