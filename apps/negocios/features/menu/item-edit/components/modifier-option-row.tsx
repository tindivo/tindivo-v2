import { Icon } from '@tindivo/ui'
import type { ModifierOption } from '../types'

interface ModifierOptionRowProps {
  opt: ModifierOption
  onChange: (patch: Partial<ModifierOption>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

export function ModifierOptionRow({
  opt,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ModifierOptionRowProps) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-ink/[0.06] py-2 ${
        opt.is_available ? '' : 'opacity-55'
      }`}
    >
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Subir opción"
          className="p-0 text-ink-subtle disabled:opacity-30"
        >
          <Icon name="keyboard_arrow_up" size={16} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Bajar opción"
          className="p-0 text-ink-subtle disabled:opacity-30"
        >
          <Icon name="keyboard_arrow_down" size={16} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <input
          className="w-full rounded-lg border border-ink/[0.06] bg-surface px-2.5 py-1.5 text-[14px] font-medium text-ink outline-none focus:border-ink"
          value={opt.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre de la opción"
        />
      </div>
      <div className="w-[90px] shrink-0">
        <input
          type="number"
          min={0}
          step={0.5}
          className="w-full rounded-lg border border-ink/[0.06] bg-surface px-2.5 py-1.5 text-right font-mono text-[13px] font-semibold outline-none focus:border-ink"
          style={{ color: opt.additional_price > 0 ? 'var(--color-success)' : undefined }}
          value={opt.additional_price === 0 ? '' : opt.additional_price}
          placeholder="0"
          onChange={(e) => onChange({ additional_price: Number.parseFloat(e.target.value) || 0 })}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ is_available: !opt.is_available })}
        className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors ${
          opt.is_available ? 'bg-success' : 'bg-ink/30'
        }`}
        aria-label={opt.is_available ? 'Marcar como agotado' : 'Marcar como disponible'}
      >
        <span
          className="absolute top-[2px] h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: opt.is_available ? 'translateX(16px)' : 'translateX(2px)' }}
        />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger"
        aria-label="Eliminar opción"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
