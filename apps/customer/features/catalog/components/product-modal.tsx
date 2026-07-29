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
          className="t-glass absolute top-3.5 right-3.5 flex h-9 w-9 items-center justify-center rounded-full text-ink"
          aria-label="Cerrar"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="t-scroll flex-1">
        <div className="px-5 pt-5 pb-1.5">
          <div className="t-display text-[26px] leading-[1.1]">{item.name}</div>
          {item.description && (
            <div className="mt-2 text-[14px] leading-[1.45] text-ink-muted">{item.description}</div>
          )}
          <div className="mt-3 font-extrabold text-[18px] text-brand">
            Desde {soles(item.base_price)}
          </div>
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
            <div className="mt-1 text-right text-[11px] text-ink-subtle">{note.length}/140</div>
          </div>
        </div>
      </div>

      <div className="t-glass-strong flex items-center gap-3 border-t border-ink/[0.04] px-4 pt-3.5 pb-6">
        <div className="t-qty">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Menos"
          >
            <Icon name="remove" size={20} />
          </button>
          <span className="val">{qty}</span>
          <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Más">
            <Icon name="add" size={20} />
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
