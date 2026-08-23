import { Button, Icon, IconButton } from '@tindivo/ui'
import { blocksItems, RULE_LABELS, ruleToMode } from '../lib/utils'
import type { LibraryGroup, LibraryOption, RuleMode } from '../types'

// Sin `w-full`: estos inputs conviven en una fila flex con un precio de ancho
// fijo, y un `w-full` en ambos deja al del nombre reducido a nada.
const INPUT_CLS =
  'min-w-0 rounded-xl border border-ink/[0.06] bg-card px-3 py-2 text-[15px] font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'

interface LibraryGroupCardProps {
  group: LibraryGroup
  expanded: boolean
  busy: boolean
  onToggleExpanded: () => void
  onRename: (name: string) => void
  onChangeRule: (mode: RuleMode) => void
  onOpenLinks: () => void
  onDelete: () => void
  onAddOption: () => void
  onSaveOption: (option: LibraryOption, patch: { name?: string; price?: number }) => void
  onDeleteOption: (option: LibraryOption) => void
  onToggleOption: (option: LibraryOption, next: boolean) => void
}

export function LibraryGroupCard({
  group,
  expanded,
  busy,
  onToggleExpanded,
  onRename,
  onChangeRule,
  onOpenLinks,
  onDelete,
  onAddOption,
  onSaveOption,
  onDeleteOption,
  onToggleOption,
}: LibraryGroupCardProps) {
  const linkCount = group.itemIds.length
  const soldOut = group.options.filter((o) => !o.is_available).length
  // Un grupo de precio total no es un extra: sus opciones SON el precio del
  // plato, y el plato deriva su base del más barato (ver migración 0156). Se
  // muestra para poder agotar un tamaño, pero no se edita ni se comparte.
  const isPricing = group.price_display === 'total'
  const blocked = blocksItems(group)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink/[0.06] p-2.5">
      <div className="flex items-center gap-2">
        <input
          className={`${INPUT_CLS} flex-1 text-[14px] font-bold`}
          defaultValue={group.name}
          key={group.name}
          onBlur={(e) => onRename(e.target.value)}
          disabled={isPricing}
          placeholder="Nombre del grupo"
        />
        <IconButton
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="text-danger hover:bg-danger/10"
          aria-label="Eliminar grupo"
        >
          <Icon name="delete" size={18} />
        </IconButton>
        <IconButton
          size="sm"
          onClick={onToggleExpanded}
          aria-label={expanded ? 'Contraer' : 'Ver opciones'}
        >
          <Icon name={expanded ? 'expand_less' : 'expand_more'} size={20} />
        </IconButton>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {isPricing ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-1 text-[10px] font-bold text-info">
            <Icon name="sell" size={10} />
            Fija el precio del plato
          </span>
        ) : (
          <select
            value={ruleToMode(group)}
            onChange={(e) => onChangeRule(e.target.value as RuleMode)}
            disabled={busy}
            aria-label="Regla del grupo"
            className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold text-ink outline-none"
          >
            {(Object.keys(RULE_LABELS) as RuleMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {RULE_LABELS[mode]}
              </option>
            ))}
          </select>
        )}

        <Button
          variant="soft"
          size="sm"
          onClick={onOpenLinks}
          disabled={busy || isPricing}
          title={
            isPricing
              ? 'Los precios son propios de cada plato, así que este grupo no se comparte'
              : 'Elegir en qué platos va'
          }
          className="h-7 gap-1 px-2.5 text-[11px]"
        >
          <Icon name="link" size={12} />
          {linkCount === 0 ? 'Sin platos' : `En ${linkCount} plato${linkCount !== 1 ? 's' : ''}`}
        </Button>

        {soldOut > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning">
            {soldOut} agotada{soldOut !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {blocked && (
        <p className="rounded-lg bg-danger/10 px-2.5 py-2 text-[11px] font-semibold text-danger">
          Este grupo es obligatorio y no le queda ninguna opción disponible. Los{' '}
          {linkCount === 1 ? 'platos' : `${linkCount} platos`} que lo usan siguen apareciendo en la
          carta, pero el cliente no puede agregarlos al carrito.
        </p>
      )}

      {linkCount === 0 && !blocked && (
        <p className="text-[11px] text-ink-muted">
          Todavía no está en ningún plato, así que el cliente no lo ve.
        </p>
      )}

      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-ink/[0.06] pt-2">
          {group.options.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Este grupo no tiene opciones.</p>
          ) : (
            group.options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  className={`${INPUT_CLS} flex-1 text-[13px] ${opt.is_available ? '' : 'opacity-55'}`}
                  defaultValue={opt.name}
                  key={opt.name}
                  onBlur={(e) => onSaveOption(opt, { name: e.target.value })}
                  disabled={isPricing}
                  placeholder="Nombre de la opción"
                />
                <input
                  className={`${INPUT_CLS} w-[86px] shrink-0 text-[13px]`}
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={opt.additional_price.toFixed(2)}
                  key={`${opt.id}-${opt.additional_price}`}
                  onBlur={(e) =>
                    onSaveOption(opt, { price: Number.parseFloat(e.target.value) || 0 })
                  }
                  disabled={isPricing}
                  aria-label={`Precio adicional de ${opt.name}`}
                />
                {/* Switch, no botón: el verde/gris ES el estado, no una
                    superficie pulsable. `ToggleSwitch` de @tindivo/ui trae
                    label y descripción propias y no cabe en esta fila; es el
                    mismo control que `item-edit/modifier-option-row`. */}
                <button
                  type="button"
                  onClick={() => onToggleOption(opt, !opt.is_available)}
                  aria-label={
                    opt.is_available
                      ? `Marcar ${opt.name} como agotada`
                      : `Marcar ${opt.name} como disponible`
                  }
                  aria-pressed={opt.is_available}
                  className={`relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors ${
                    opt.is_available ? 'bg-success' : 'bg-ink/30'
                  }`}
                >
                  <span
                    className="absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform"
                    style={{
                      transform: opt.is_available ? 'translateX(18px)' : 'translateX(0)',
                    }}
                  />
                </button>
                {!isPricing && (
                  <IconButton
                    size="sm"
                    onClick={() => onDeleteOption(opt)}
                    disabled={busy}
                    className="text-danger hover:bg-danger/10"
                    aria-label={`Eliminar ${opt.name}`}
                  >
                    <Icon name="delete" size={16} />
                  </IconButton>
                )}
              </div>
            ))
          )}

          {isPricing ? (
            <p className="text-[11px] text-ink-muted">
              Los nombres y precios de este grupo se editan desde el plato, porque de ellos sale su
              precio base. Acá solo se agota un tamaño.
            </p>
          ) : (
            <Button
              variant="soft"
              size="sm"
              onClick={onAddOption}
              disabled={busy}
              className="h-8 w-full gap-1.5 text-[12px]"
            >
              <Icon name="add" size={14} />
              Agregar opción
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
