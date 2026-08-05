import { Icon } from '@tindivo/ui'
import { groupRuleLabel } from '../lib/utils'
import type { ModifierGroup } from '../types'
import { GroupRuleSelector } from './group-rule-selector'
import { ModifierOptionRow } from './modifier-option-row'

interface ModifierGroupCardProps {
  group: ModifierGroup
  index: number
  total: number
  onToggleExpand: () => void
  onChange: (patch: Partial<ModifierGroup>) => void
  onDelete: () => void
  onAddOption: () => void
  onDeleteOption: (optLocalId: string) => void
  onChangeOption: (optLocalId: string, patch: Partial<ModifierGroup['options'][number]>) => void
  onMoveOption: (optLocalId: string, dir: -1 | 1) => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function ModifierGroupCard({
  group,
  index,
  total,
  onToggleExpand,
  onChange,
  onDelete,
  onAddOption,
  onDeleteOption,
  onChangeOption,
  onMoveOption,
  onMoveUp,
  onMoveDown,
}: ModifierGroupCardProps) {
  const isRequired = group.is_required
  const visibleOptions = group.options.filter((o) => !o.isDeleted)

  return (
    <div
      className={`mb-2.5 overflow-hidden rounded-2xl border-[1.5px] bg-card ${
        isRequired ? 'border-info/30' : 'border-ink/[0.06]'
      }`}
    >
      <div
        className={`flex items-center gap-2.5 px-3.5 py-3 ${
          isRequired ? 'bg-info/10' : 'bg-surface'
        } ${group.isExpanded ? 'border-b border-ink/[0.06]' : ''}`}
      >
        <Icon name="drag_indicator" size={18} className="shrink-0 text-ink-subtle" />
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 bg-transparent text-left"
        >
          <div className="text-[15px] font-bold leading-tight text-ink">
            {group.name || 'Grupo sin nombre'}
          </div>
          <div
            className={`mt-0.5 text-[11px] font-semibold ${isRequired ? 'text-info' : 'text-ink-muted'}`}
          >
            {groupRuleLabel(group)}
          </div>
          {!group.isExpanded && (
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {visibleOptions.length} opciones
              {visibleOptions.filter((o) => !o.is_available).length > 0 &&
                ` · ${visibleOptions.filter((o) => !o.is_available).length} agotada/s`}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1">
          {index > 0 && (
            <button
              type="button"
              onClick={onMoveUp}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink/[0.06] text-ink"
              aria-label="Subir grupo"
            >
              <Icon name="arrow_upward" size={13} />
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              onClick={onMoveDown}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink/[0.06] text-ink"
              aria-label="Bajar grupo"
            >
              <Icon name="arrow_downward" size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger"
            aria-label="Eliminar grupo"
          >
            <Icon name="delete" size={13} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink/[0.06] text-ink"
            aria-label={group.isExpanded ? 'Colapsar' : 'Expandir'}
          >
            <Icon name={group.isExpanded ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        </div>
      </div>

      {group.isExpanded && (
        <div className="p-3.5">
          <div className="mb-3">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: input asociado como hermano */}
            <label className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
              Nombre del grupo
            </label>
            <input
              className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3 text-[15px] font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
              value={group.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Ej: Tamaño, Extras, Salsas"
            />
          </div>

          <GroupRuleSelector group={group} onChange={onChange} />

          <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
            Opciones
          </div>
          <div className="mb-2">
            <div
              className="grid gap-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-ink/55"
              style={{ gridTemplateColumns: '1fr 90px 34px 28px', marginLeft: 24 }}
            >
              <span>Nombre</span>
              <span className="text-right">+ Precio</span>
              <span />
              <span />
            </div>
            {visibleOptions.map((opt, oi) => (
              <ModifierOptionRow
                key={opt.localId}
                opt={opt}
                onChange={(patch) => onChangeOption(opt.localId, patch)}
                onDelete={() => onDeleteOption(opt.localId)}
                onMoveUp={() => onMoveOption(opt.localId, -1)}
                onMoveDown={() => onMoveOption(opt.localId, 1)}
                isFirst={oi === 0}
                isLast={oi === visibleOptions.length - 1}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onAddOption}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink/[0.12] bg-ink/[0.03] py-2 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink/[0.06]"
          >
            <Icon name="add" size={15} />
            Agregar opción
          </button>
        </div>
      )}
    </div>
  )
}
