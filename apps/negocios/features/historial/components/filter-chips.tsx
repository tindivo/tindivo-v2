'use client'

import type { HistFilter } from '../types'

const filters: { id: HistFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'delivered', label: 'Entregados' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'web', label: 'Web' },
  { id: 'manual', label: 'Manual' },
]

export function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: HistFilter
  counts: Record<HistFilter, number>
  onChange: (f: HistFilter) => void
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {filters.map((f) => {
        const on = active === f.id
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-all ${
              on
                ? 'bg-ink text-white'
                : 'border border-ink/[0.06] bg-card text-ink hover:bg-surface'
            }`}
          >
            {f.label}
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                on ? 'bg-white/20 text-white' : 'bg-ink/[0.06] text-ink'
              }`}
            >
              {counts[f.id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
