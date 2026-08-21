import { Icon } from '@tindivo/ui'
import { ProductImage } from '@/components/product-image'
import { HighlightedText } from '@/features/catalog/components/highlighted-text'
import { soles } from '@/features/catalog/lib/format'
import type { MatchRange } from '@/features/catalog/lib/menu-search'
import type { MenuItem } from '@/features/catalog/types'

interface MenuItemCardProps {
  item: MenuItem
  disabled?: boolean
  onClick: (item: MenuItem) => void
  /**
   * Los tres de abajo solo los manda la búsqueda. En la carta normal la
   * categoría ya la dice el encabezado de la sección y no hay nada que
   * resaltar, así que la tarjeta se pinta igual que siempre.
   */
  categoryLabel?: string
  nameRanges?: MatchRange[]
  descriptionRanges?: MatchRange[]
}

export function MenuItemCard({
  item,
  disabled,
  onClick,
  categoryLabel,
  nameRanges,
  descriptionRanges,
}: MenuItemCardProps) {
  const groups = item.modifier_groups ?? []
  const hasOptions = groups.some((g) => g.options.length > 0)
  const hasPaidOptions = groups.some((g) => g.options.some((o) => Number(o.additional_price) > 0))

  return (
    <button
      type="button"
      disabled={disabled || !item.is_available}
      onClick={() => onClick(item)}
      className="flex items-stretch gap-3.5 rounded-[20px] border border-ink/[0.04] bg-card p-4 text-left shadow-elev-1 transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985] disabled:opacity-50"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {(categoryLabel || item.is_compact || item.badges?.[0]) && (
            <span className="mb-1.5 flex flex-wrap gap-1.5">
              {categoryLabel && (
                <span className="inline-block rounded-md bg-ink/[0.05] px-2 py-[3px] font-bold text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  {categoryLabel}
                </span>
              )}
              {item.is_compact && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] uppercase tracking-[0.08em] text-brand">
                  <Icon name="star" size={12} filled /> Destacado
                </span>
              )}
              {item.badges?.[0] && (
                <span className="inline-block rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] uppercase tracking-[0.08em] text-brand">
                  {item.badges[0]}
                </span>
              )}
            </span>
          )}
          <div className="mb-1 font-display text-[16px] font-bold tracking-tight">
            <HighlightedText text={item.name} ranges={nameRanges} />
          </div>
          {item.description && (
            <div className="line-clamp-2 text-[12px] leading-[1.4] text-ink-muted">
              <HighlightedText text={item.description} ranges={descriptionRanges} />
            </div>
          )}
        </div>
        <div className="mt-2 font-semibold text-[15px] tabular-nums">
          {hasPaidOptions ? `Desde ${soles(item.base_price)}` : soles(item.base_price)}
          {hasOptions && (
            <span className="ml-1.5 font-normal text-[11px] text-ink-subtle">· Personalizable</span>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <ProductImage label={item.name} hue={item.image_hue ?? 14} size={92} src={item.image_url} />
        <span className="absolute -right-1.5 -bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c42] text-white shadow-glow-brand">
          <Icon name="add" size={20} />
        </span>
      </div>
    </button>
  )
}
