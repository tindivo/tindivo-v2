import { BottomSheet, Button, Icon } from '@tindivo/ui'
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
      <div className="relative flex-1 overflow-y-auto scrollbar-hide">
        {/* Botón de cerrar fijo en la esquina superior derecha */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.85] text-ink shadow-elev-2 backdrop-blur-2xl transition-transform active:scale-95"
          aria-label="Cerrar"
        >
          <Icon name="close" size={18} />
        </button>

        {/* Imagen dentro del scroll con altura optimizada */}
        <div
          className="relative flex h-[170px] w-full items-center justify-center overflow-hidden rounded-none sm:h-[200px]"
          style={{ background: `oklch(0.92 0.04 ${hue})` }}
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="relative z-[1] font-mono text-[11px] tracking-[0.06em]"
              style={{ color: `oklch(0.35 0.1 ${hue})` }}
            >
              [ {item.name.toUpperCase()} ]
            </span>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface/40 via-transparent to-black/20" />
        </div>
        <div className="px-5 pt-5 pb-1.5">
          <div className="font-display text-[26px] font-bold leading-[1.1] tracking-tight">
            {item.name}
          </div>
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
              basePrice={item.base_price}
              selected={g.selection_type === 'single' ? (single[g.id] ?? '') : (multi[g.id] ?? [])}
              missing={missing.includes(g)}
              onToggle={toggle}
            />
          ))}

          <div className="mt-[18px] mb-4">
            <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
              Nota especial (opcional)
            </span>
            <textarea
              className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
              placeholder="Ej. sin cebolla, bien cocido, tocar timbre 2 veces…"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-1 text-right text-[11px] text-ink-subtle">{note.length}/140</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border border-white/[0.08] border-t-ink/[0.04] bg-white/[0.90] px-4 pt-3.5 pb-6 shadow-elev-3 backdrop-blur-3xl">
        <div className="inline-flex items-center rounded-full bg-ink/[0.06] p-1">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Menos"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95"
          >
            <Icon name="remove" size={20} />
          </button>
          <span className="min-w-7 text-center font-semibold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            aria-label="Más"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95"
          >
            <Icon name="add" size={20} />
          </button>
        </div>
        <Button type="button" variant="brand" className="flex-1" disabled={!valid} onClick={add}>
          {valid
            ? `Agregar · ${soles(total)}`
            : `Completa ${missing.length} ${missing.length === 1 ? 'opción' : 'opciones'}`}
        </Button>
      </div>
    </BottomSheet>
  )
}
