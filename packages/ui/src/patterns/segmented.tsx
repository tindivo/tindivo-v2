import type { ReactNode } from 'react'

/** Toggle pill (Delivery/Recojo, rangos de fecha, sub-tabs, etc.). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-[14px] bg-ink/[0.06] p-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] font-semibold transition-all ${
              active
                ? 'bg-white text-ink shadow-[0_2px_8px_rgba(18,38,32,0.08)]'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
