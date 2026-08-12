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
    <div className="rounded-[24px] border border-ink/10 bg-white p-4 sm:p-5 shadow-xs">
      <p className="mb-3 block font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        Tiempo de preparación
      </p>
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
        {PREP_PRESETS.map((m) => {
          const active = m === value
          return (
            <button
              type="button"
              key={m}
              onClick={() => onChange(m)}
              className={`h-[52px] w-[52px] shrink-0 rounded-full font-mono text-[14px] font-bold transition-all duration-150 flex items-center justify-center active:scale-95 ${
                active
                  ? 'bg-ink text-white shadow-md border border-ink'
                  : 'border border-ink/15 bg-white text-ink hover:bg-surface hover:border-ink/30'
              }`}
            >
              {m}m
            </button>
          )
        })}
      </div>
    </div>
  )
}
