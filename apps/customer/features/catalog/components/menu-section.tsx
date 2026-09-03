'use client'

import { isCompactSection } from '@/features/catalog/lib/menu-density'
import type { Category, MenuItem } from '@/features/catalog/types'
import { MenuCompactRow } from './menu-compact-row'
import { MenuItemCard } from './menu-item-card'

interface MenuSectionProps {
  category: Category
  disabled?: boolean
  sectionRef?: (el: HTMLDivElement | null) => void
  onItemClick: (item: MenuItem) => void
  /** Añadir sin abrir el detalle. Solo lo usan los platos sin opciones. */
  onQuickAdd: (item: MenuItem) => void
}

export function MenuSection({
  category,
  disabled,
  sectionRef,
  onItemClick,
  onQuickAdd,
}: MenuSectionProps) {
  // La regla vive en `menu-density.ts`, con sus tests y su porqué.
  const compacta = isCompactSection(category)

  return (
    <div ref={sectionRef} className="scroll-mt-[100px] pt-4">
      <div className="mb-2.5 flex items-baseline gap-2">
        <div className="font-display font-bold text-[22px] tracking-tight">{category.name}</div>
        <div className="font-medium text-[12px] text-ink-subtle tabular-nums">
          {category.items.length} {category.items.length === 1 ? 'plato' : 'platos'}
        </div>
      </div>
      {category.blurb && (
        <div className="-mt-2 mb-2.5 text-[12px] text-ink/55">{category.blurb}</div>
      )}

      {compacta ? (
        <div className="overflow-hidden rounded-[18px] border border-ink/[0.04] bg-card shadow-elev-1">
          {category.items.map((item, i) => (
            <MenuCompactRow
              key={item.id}
              item={item}
              disabled={disabled}
              first={i === 0}
              onOpen={onItemClick}
              onAdd={onQuickAdd}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
          {category.items.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              disabled={disabled}
              onClick={onItemClick}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>
      )}
    </div>
  )
}
