'use client'

import type { Category, MenuItem } from '@/features/catalog/types'
import { MenuItemCard } from './menu-item-card'

interface MenuSectionProps {
  category: Category
  disabled?: boolean
  sectionRef?: (el: HTMLDivElement | null) => void
  onItemClick: (item: MenuItem) => void
}

export function MenuSection({ category, disabled, sectionRef, onItemClick }: MenuSectionProps) {
  return (
    <div ref={sectionRef} className="scroll-mt-[70px] pt-4">
      <div className="mb-2.5">
        <div className="font-display text-[22px] font-bold tracking-tight">{category.name}</div>
        {category.blurb && <div className="mt-0.5 text-[12px] text-ink/55">{category.blurb}</div>}
      </div>
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
        {category.items.map((item) => (
          <MenuItemCard key={item.id} item={item} disabled={disabled} onClick={onItemClick} />
        ))}
      </div>
    </div>
  )
}
