import { Icon } from '@tindivo/ui'
import { capabilityLabel, SECTIONS } from '../lib/constants'
import type { SectionId } from '../types'

interface SectionNavProps {
  active: SectionId
  capability: string
  onSelect: (id: SectionId) => void
}

export function SectionNav({ active, capability, onSelect }: SectionNavProps) {
  const sections = SECTIONS.filter((s) => !s.hiddenFor?.some((c) => c === capability))

  return (
    <aside className="sticky top-0">
      <div className="flex flex-col gap-1">
        {sections.map((it) => {
          const isActive = active === it.id
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-all ${
                isActive ? 'bg-card text-ink shadow-elev-1' : 'text-ink-muted hover:bg-card/60'
              }`}
            >
              <Icon
                name={it.icon}
                size={20}
                filled={isActive}
                className={isActive ? 'text-brand' : 'text-ink-subtle'}
              />
              {it.label}
            </button>
          )
        })}
      </div>
      <p className="mt-4 px-3 text-[12px] text-ink-muted">
        Modo: <span className="font-semibold text-ink">{capabilityLabel(capability)}</span>
      </p>
    </aside>
  )
}
