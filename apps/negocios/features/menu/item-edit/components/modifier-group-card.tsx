import { Button, Icon } from '@tindivo/ui'
import {
  acceptsTotalPricing,
  groupRuleLabel,
  grupoEditableDesdeElPlato,
  motivoDeSoloLectura,
  optionDisplayPrice,
} from '../lib/utils'
import type { ModifierGroup, PriceDisplay } from '../types'
import { GroupRuleSelector } from './group-rule-selector'
import { ModifierOptionRow } from './modifier-option-row'
import { PriceDisplaySwitch } from './price-display-switch'

interface ModifierGroupCardProps {
  group: ModifierGroup
  index: number
  total: number
  basePrice: number
  /** Nombre del otro grupo que ya manda sobre el precio, si lo hay. */
  totalPricingTakenBy: string | null
  onToggleExpand: () => void
  onChange: (patch: Partial<ModifierGroup>) => void
  onPriceDisplayChange: (mode: PriceDisplay) => void
  onDelete: () => void
  onAddOption: () => void
  onDeleteOption: (optLocalId: string) => void
  onChangeOption: (optLocalId: string, patch: Partial<ModifierGroup['options'][number]>) => void
  onMoveOption: (optLocalId: string, dir: -1 | 1) => void
  onMoveUp: () => void
  onMoveDown: () => void
  /** Sube el grupo a la biblioteca de Extras del negocio. */
  onPromoteToLibrary?: () => void
}

export function ModifierGroupCard({
  group,
  index,
  total,
  basePrice,
  totalPricingTakenBy,
  onToggleExpand,
  onChange,
  onPriceDisplayChange,
  onDelete,
  onAddOption,
  onDeleteOption,
  onChangeOption,
  onMoveOption,
  onMoveUp,
  onMoveDown,
  onPromoteToLibrary,
}: ModifierGroupCardProps) {
  const isRequired = group.is_required
  const isTotal = group.price_display === 'total'
  const visibleOptions = group.options.filter((o) => !o.isDeleted)

  /**
   * Si OTROS platos usan este grupo, aquí no se edita.
   *
   * No es una preferencia de UI: el guardado escribe sobre
   * `menu_modifier_groups` y `menu_modifier_options`, que son del NEGOCIO, no
   * del plato. Editar «Cremas» desde la hamburguesa le cambiaba el nombre, las
   * reglas y las opciones a los otros seis platos que la usan, y borrar «ají»
   * aquí lo borraba del menú entero — el borrado del grupo sí cuenta
   * referencias antes de tirar la fila, el de las opciones no contaba nada.
   *
   * Se corta en los dos sitios a propósito: aquí para que nadie escriba lo que
   * luego se va a ignorar, y en `use-item-editor` para que el dato quede a
   * salvo aunque otra pantalla llame al guardado.
   *
   * Lo que SÍ se puede desde aquí es quitarlo del plato: desenlazar es una
   * decisión de este plato y no toca a los demás.
   */
  const loUsanOtrosPlatos = !grupoEditableDesdeElPlato(group)
  const motivo = motivoDeSoloLectura(group)

  /**
   * `isNew` marca los que aún no existen en la base: no hay fila que subir.
   * `isLibrary` marca los que ya están arriba.
   */
  const puedeSubirseAExtras =
    Boolean(onPromoteToLibrary) && Boolean(group.id) && !group.isNew && !group.isLibrary

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
            {isTotal && ' · define el precio'}
          </div>
          {motivo === 'compartido' && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
              <Icon name="link" size={10} />
              Compartido con {group.sharedWith} plato{group.sharedWith === 1 ? '' : 's'} · aquí se
              ve, no se edita
            </div>
          )}
          {motivo === 'biblioteca' && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-dark">
              <Icon name="library_books" size={10} />
              De Extras · aquí se ve, no se edita
            </div>
          )}
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

      {group.isExpanded && loUsanOtrosPlatos && (
        <div className="p-3.5">
          <div className="mb-3 rounded-xl border border-warning/25 bg-warning/[0.06] p-3">
            <div className="flex items-start gap-2">
              <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-warning" />
              <div className="text-[12px] leading-relaxed text-ink">
                {motivo === 'compartido' ? (
                  <>
                    <strong>Este grupo es compartido.</strong> Lo usan {group.sharedWith} plato
                    {group.sharedWith === 1 ? '' : 's'} más, así que aquí se ve pero no se edita: lo
                    que cambiaras se les cambiaría a todos.
                  </>
                ) : (
                  <>
                    <strong>Este grupo está en Extras.</strong> Es del negocio, no de este plato,
                    así que aquí se ve pero no se edita — aunque de momento solo lo uses aquí.
                  </>
                )}
                <div className="mt-1 text-ink-muted">
                  Para que este plato lo tenga a su manera, quítalo con la papelera y crea uno
                  propio.
                </div>
                {/* El motivo por el que Extras es una ruta y no un modal: aquí
                    se puede enlazar, y con `?g=` se abre este grupo concreto en
                    vez de dejar al dueño buscándolo en una lista. */}
                <a
                  href={`/menu/extras?g=${group.id}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-bold text-brand-dark hover:underline"
                >
                  <Icon name="open_in_new" size={13} />
                  Editarlo en Extras
                </a>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
              Nombre del grupo
            </div>
            <div className="rounded-2xl border border-ink/[0.06] bg-surface px-4 py-3 text-[15px] font-medium text-ink-muted">
              {group.name}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
              Regla
            </div>
            <div className="rounded-2xl border border-ink/[0.06] bg-surface px-4 py-3 text-[13px] text-ink-muted">
              {groupRuleLabel(group)}
              {isTotal && ' · define el precio'}
            </div>
          </div>

          <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
            Opciones
          </div>
          <div className="overflow-hidden rounded-2xl border border-ink/[0.06]">
            {visibleOptions.map((opt) => (
              <div
                key={opt.localId}
                className="flex items-center justify-between gap-2 border-b border-ink/[0.04] bg-surface px-4 py-2.5 text-[13px] last:border-b-0"
              >
                <span className={opt.is_available ? 'text-ink' : 'text-ink-muted line-through'}>
                  {opt.name}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-muted">
                  {isTotal ? 'S/ ' : '+ S/ '}
                  {optionDisplayPrice(basePrice, group, opt).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {group.isExpanded && !loUsanOtrosPlatos && (
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

          {(acceptsTotalPricing(group) || isTotal) && (
            <PriceDisplaySwitch
              value={group.price_display}
              blockedBy={isTotal ? null : totalPricingTakenBy}
              onChange={onPriceDisplayChange}
            />
          )}

          <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
            Opciones
          </div>
          <div className="mb-2">
            <div className="ml-6 grid grid-cols-[1fr_90px_34px_28px] gap-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-ink/55">
              <span>Nombre</span>
              <span className="text-right">{isTotal ? 'Precio S/' : '+ Precio'}</span>
              <span />
              <span />
            </div>
            {visibleOptions.map((opt, oi) => (
              <ModifierOptionRow
                key={opt.localId}
                opt={opt}
                priceValue={optionDisplayPrice(basePrice, group, opt)}
                priceDisplay={group.price_display}
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

          {/* La única puerta por la que entra algo a la biblioteca. Solo aparece
              cuando el grupo ya está guardado (tiene id) y todavía es propio:
              en un grupo sin guardar no habría fila que actualizar, y en uno que
              ya está en Extras no hay nada que subir. */}
          {puedeSubirseAExtras && (
            <div className="mt-2.5 rounded-xl border border-brand/20 bg-brand/[0.04] p-3">
              <div className="text-[12px] leading-relaxed text-ink">
                <strong>¿Este grupo te sirve en otros platos?</strong>
                <div className="mt-0.5 text-ink-muted">
                  Súbelo a Extras y podrás buscarlo y vincularlo desde cualquier plato, sin volver a
                  escribirlo. A partir de ahí se edita en Extras.
                </div>
              </div>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={onPromoteToLibrary}
                className="mt-2 text-[12px]"
              >
                <Icon name="library_add" size={15} />
                Usar también en otros platos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
