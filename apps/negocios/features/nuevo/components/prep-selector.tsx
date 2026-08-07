'use client'

import { PREP_PRESETS } from '../lib/constants'

export function PrepSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (m: number) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <label className="mb-2 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Tiempo de preparación
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {PREP_PRESETS.map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => onChange(m)}
            className={`h-11 min-w-[52px] shrink-0 rounded-xl font-mono text-sm font-bold transition-all ${
              m === value
                ? 'bg-ink text-white'
                : 'border border-border bg-card text-ink hover:bg-surface'
            }`}
          >
            {m}m
          </button>
        ))}
      </div>
    </div>
  )
}
