'use client'

import type { Category } from '@/features/catalog/types'

interface CategoryTabsProps {
  categories: Category[]
  active: string
  onSelect: (id: string) => void
}

export function CategoryTabs({ categories, active, onSelect }: CategoryTabsProps) {
  return (
    <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-ink/[0.05] bg-surface/[0.92] px-4 py-2.5 backdrop-blur-sm scrollbar-hide">
      {categories.map((c) => {
        const isActive = active === c.id
        return (
          <button
            key={c.id}
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium transition-colors ${
              isActive
                ? 'border-ink bg-ink text-white'
                : 'border-ink/[0.08] bg-card text-ink hover:bg-ink/[0.04]'
            }`}
            onClick={() => onSelect(c.id)}
          >
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
