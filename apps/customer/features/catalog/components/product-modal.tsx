'use client'

import { BottomSheet, Icon } from '@/components/ui'
import { useProductOptions } from '@/features/catalog/hooks/use-product-options'
import { soles } from '@/features/catalog/lib/format'
import type { ProductItem } from '@/features/catalog/types'
import type { CartLine } from '@/lib/cart'
import { ModifierGroup } from './modifier-group'

interface ProductModalProps {
  item: ProductItem
  onClose: () => void
  onAdd: (line: Omit<CartLine, 'key'>) => void
}

export function ProductModal({ item, onClose, onAdd }: ProductModalProps) {
  const {
    groups,
    single,
    multi,
    qty,
    setQty,
    note,
    setNote,
    missing,
    valid,
    total,
    hue,
    toggle,
    buildLine,
  } = useProductOptions(item)

  function add() {
    onAdd(buildLine())
  }

  return (
    <BottomSheet open onClose={onClose}>
      <div className="relative">
        <div
          className="t-ph-image flex h-[280px] w-full items-center justify-center overflow-hidden rounded-none"
          style={{ background: `oklch(0.92 0.04 ${hue})` }}
        >
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <span
              className="relative z-[1] font-mono text-[11px] tracking-[0.06em]"
              style={{ color: `oklch(0.35 0.1 ${hue})` }}
            >
              [ {item.name.toUpperCase()} ]
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
          aria-label="Cerrar"
        >
          <Icon.Close />
        </button>
      </div>

      <div className="t-scroll flex-1">
        <div className="px-5 pt-5 pb-1.5">
          <div className="t-display text-[26px] leading-[1.1]">{item.name}</div>
          {item.description && (
            <div className="mt-2 text-[14px] leading-[1.45] text-black/65">{item.description}</div>
          )}
          <div className="mt-3 font-semibold text-[18px]">Desde {soles(item.base_price)}</div>
        </div>

        <div className="px-5 pt-3">
          {groups.map((g) => (
            <ModifierGroup
              key={g.id}
              group={g}
              selected={g.selection_type === 'single' ? (single[g.id] ?? '') : (multi[g.id] ?? [])}
              missing={missing.includes(g)}
              onToggle={toggle}
            />
          ))}

          <div className="mt-[18px] mb-4">
            <span className="t-field-label">Nota especial (opcional)</span>
            <textarea
              className="t-field"
              placeholder="Ej. sin cebolla, bien cocido, tocar timbre 2 veces…"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-1 text-right text-[11px] text-black/40">{note.length}/140</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-surface px-4 pt-3.5 pb-6">
        <div className="t-qty">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Menos"
          >
            <Icon.Minus />
          </button>
          <span className="val">{qty}</span>
          <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Más">
            <Icon.Plus />
          </button>
        </div>
        <button
          type="button"
          className="t-btn t-btn-primary flex-1"
          disabled={!valid}
          onClick={add}
        >
          {valid
            ? `Agregar · ${soles(total)}`
            : `Completa ${missing.length} ${missing.length === 1 ? 'opción' : 'opciones'}`}
        </button>
      </div>
    </BottomSheet>
  )
}
