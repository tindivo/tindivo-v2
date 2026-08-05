import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { itemMinPrice } from '../lib/utils'
import type { FormData, ModifierGroup, ModifierOption } from '../types'

interface CustomerPreviewPanelProps {
  formData: FormData
  groups: ModifierGroup[]
  imageSrc: string | null
  className?: string
}

function CustomerOptionPill({
  opt,
  selected,
  multi,
}: {
  opt: ModifierOption
  selected: boolean
  multi: boolean
}) {
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 ${
        selected
          ? 'border-2 border-brand bg-brand-soft'
          : 'border-[1.5px] border-ink/[0.06] bg-card'
      } ${opt.is_available ? '' : 'opacity-55'}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
          multi ? 'rounded-md' : 'rounded-full'
        } ${selected ? 'border-brand bg-brand' : 'border-ink/[0.12]'}`}
      >
        {selected && <Icon name="check" size={12} className="text-white" />}
      </span>
      <span
        className={`flex-1 text-[15px] ${
          opt.is_available ? 'text-ink' : 'text-ink-subtle line-through'
        } ${selected ? 'font-semibold' : ''}`}
      >
        {opt.name}
        {!opt.is_available && <span className="ml-1.5 text-[11px] text-ink-subtle">Agotado</span>}
      </span>
      {opt.additional_price > 0 ? (
        <span className="shrink-0 font-mono text-[13px] font-semibold text-ink-muted">
          +{soles(opt.additional_price)}
        </span>
      ) : (
        <span className="shrink-0 text-[12px] font-semibold text-success">Incluido</span>
      )}
    </div>
  )
}

function CustomerModifierGroup({ group }: { group: ModifierGroup }) {
  const isRequired = group.is_required
  const ruleLabel = isRequired
    ? group.max_selections === 1
      ? 'Elige 1 opción'
      : `Elige ${group.min_selections}–${group.max_selections ?? '?'} opciones`
    : group.max_selections === 1
      ? 'Elige 1 (opcional)'
      : `Hasta ${group.max_selections ?? '?'} opciones`

  const visibleOptions = group.options.filter((o) => !o.isDeleted)

  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[16px] font-bold text-ink">{group.name}</div>
          <div className="mt-0.5 text-[12px] text-ink-muted">{ruleLabel}</div>
        </div>
        {isRequired ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-bold text-warning">
            Obligatorio
          </span>
        ) : (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
            Opcional
          </span>
        )}
      </div>
      {visibleOptions.map((opt, i) => (
        <CustomerOptionPill
          key={opt.localId}
          opt={opt}
          selected={i === 0 && isRequired}
          multi={(group.max_selections ?? 1) > 1}
        />
      ))}
    </div>
  )
}

export function CustomerPreviewPanel({
  formData,
  groups,
  imageSrc,
  className = '',
}: CustomerPreviewPanelProps) {
  const basePrice = Number.parseFloat(formData.base_price) || 0
  const visibleGroups = groups.filter(
    (g) => !g.isDeleted && g.options.filter((o) => !o.isDeleted).length > 0,
  )
  const minP = itemMinPrice(basePrice, groups)

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[20px] border border-ink/[0.06] bg-surface ${className}`}
    >
      <div className="flex items-center gap-2 bg-ink px-4 py-2.5 text-white">
        <Icon name="smartphone" size={16} filled />
        <span className="text-[13px] font-semibold">Vista del cliente · PWA Tindivo</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-card">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={formData.name || 'Foto del plato'}
            className="block h-[200px] w-full object-cover"
          />
        ) : (
          <div className="flex h-[180px] w-full items-center justify-center bg-surface-low">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink/40">
              {formData.name.toUpperCase() || 'FOTO'}
            </span>
          </div>
        )}

        <div className="p-4">
          <div className="mb-3 flex items-start gap-2.5">
            <div className="flex-1">
              {formData.badges.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {formData.badges.map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand-dark"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[22px] font-bold leading-tight text-ink">
                {formData.name || 'Nombre del plato'}
              </div>
              {formData.description && (
                <div className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
                  {formData.description}
                </div>
              )}
            </div>
            <div className="shrink-0 font-mono text-[22px] font-bold text-brand">{soles(minP)}</div>
          </div>

          <div className="mb-4 h-px bg-ink/[0.06]" />

          {visibleGroups.length === 0 ? (
            <div className="py-5 text-center text-ink-muted">
              <Icon name="shopping_cart" size={32} className="mx-auto text-success" />
              <div className="mt-2 font-semibold text-ink">Sin opciones adicionales</div>
              <div className="mt-1 text-[13px]">Se agrega directamente al carrito.</div>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <CustomerModifierGroup key={group.localId} group={group} />
            ))
          )}
        </div>
      </div>

      <div className="border-t border-ink/[0.06] bg-card p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-xl bg-surface p-0.5">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-card"
            >
              <Icon name="remove" size={16} />
            </button>
            <span className="min-w-[30px] text-center font-mono text-[16px] font-bold">1</span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white"
            >
              <Icon name="add" size={16} />
            </button>
          </div>
          <button
            type="button"
            className="flex flex-1 items-center justify-between rounded-xl bg-brand px-4 py-3.5 font-bold text-white shadow-[0_4px_14px_-4px_rgba(249,115,22,0.5)]"
          >
            <span>Agregar al pedido</span>
            <span className="font-mono">{soles(minP)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
