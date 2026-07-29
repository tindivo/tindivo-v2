'use client'

import type { Category } from '@/features/catalog/types'

interface CategoryTabsProps {
  categories: Category[]
  active: string
  onSelect: (id: string) => void
}

export function CategoryTabs({ categories, active, onSelect }: CategoryTabsProps) {
  return (
    <div className="t-section-tabs">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`t-chip${active === c.id ? ' active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
