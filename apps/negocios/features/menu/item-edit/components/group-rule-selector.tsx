import { Icon } from '@tindivo/ui'
import { modeToRule, ruleToMode } from '../lib/utils'
import type { ModifierGroup, RuleMode } from '../types'

interface GroupRuleSelectorProps {
  group: ModifierGroup
  onChange: (patch: Partial<ModifierGroup>) => void
}

export function GroupRuleSelector({ group, onChange }: GroupRuleSelectorProps) {
  const mode = ruleToMode(group)

  function handleModeChange(newMode: RuleMode) {
    const rules = modeToRule(newMode, group.max_selections)
    onChange(rules)
  }

  return (
    <div className="mb-3.5">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: select asociado como hermano */}
      <label className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
        Tipo de selección
      </label>
      <div className="relative">
        <select
          className="w-full appearance-none rounded-2xl border border-ink/[0.06] bg-card px-4 py-3 pr-10 text-[14px] font-semibold text-ink outline-none focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as RuleMode)}
        >
          <option value="required-one">Obligatorio, elegir 1</option>
          <option value="required-many">Obligatorio, elegir varios</option>
          <option value="optional-one">Opcional, elegir 1</option>
          <option value="optional-many">Opcional, elegir varios</option>
        </select>
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
          <Icon name="expand_more" size={20} className="text-ink-muted" />
        </div>
      </div>
      {(mode === 'required-many' || mode === 'optional-many') && (
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
            Máximo a elegir
          </span>
          <input
            type="number"
            min={2}
            max={20}
            value={group.max_selections ?? 3}
            onChange={(e) => onChange({ max_selections: Number(e.target.value) || 3 })}
            className="w-16 rounded-xl border border-ink/[0.06] bg-card px-2 py-1.5 text-center font-mono text-[15px] font-bold text-ink outline-none focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
          />
          <span className="text-[12px] text-ink-muted">opciones</span>
        </div>
      )}
    </div>
  )
}
