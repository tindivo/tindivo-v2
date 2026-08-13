import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { BADGE_PRESETS } from '../lib/constants'
import { findTotalPricingGroup } from '../lib/utils'
import type { Category, FormData, ModifierGroup, PriceDisplay } from '../types'
import { AddGroupButton } from './add-group-button'
import { DangerZone } from './danger-zone'
import { ModifierGroupCard } from './modifier-group-card'
import { PriceLiveSummary } from './price-live-summary'
import { PriceWarningCard } from './price-warning-card'

export interface EditorFormProps {
  formData: FormData
  cats: Category[]
  groups: ModifierGroup[]
  isNew: boolean
  onFormChange: (patch: Partial<FormData>) => void
  onGroupChange: (localId: string, patch: Partial<ModifierGroup>) => void
  onGroupPriceDisplayChange: (localId: string, mode: PriceDisplay) => void
  onGroupToggleExpand: (localId: string) => void
  onGroupDelete: (localId: string) => void
  onGroupAddOption: (groupLocalId: string) => void
  onGroupDeleteOption: (groupLocalId: string, optLocalId: string) => void
  onGroupChangeOption: (
    groupLocalId: string,
    optLocalId: string,
    patch: Partial<ModifierGroup['options'][number]>,
  ) => void
  onGroupMoveOption: (groupLocalId: string, optLocalId: string, dir: -1 | 1) => void
  onGroupMoveUp: (index: number) => void
  onGroupMoveDown: (index: number) => void
  onAddGroup: () => void
  onDeleteItem: () => void
  imageSrc: string | null
  imageError: string | null
  imageBusy: boolean
  onPickImage: (file: File) => void
  onClearImage: () => void
}

const inputCls =
  'w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'
const inputMonoCls = `${inputCls} font-mono`
const labelCls =
  'mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55'

export function EditorForm({
  formData,
  cats,
  groups,
  isNew,
  onFormChange,
  onGroupChange,
  onGroupPriceDisplayChange,
  onGroupToggleExpand,
  onGroupDelete,
  onGroupAddOption,
  onGroupDeleteOption,
  onGroupChangeOption,
  onGroupMoveOption,
  onGroupMoveUp,
  onGroupMoveDown,
  onAddGroup,
  onDeleteItem,
  imageSrc,
  imageError,
  imageBusy,
  onPickImage,
  onClearImage,
}: EditorFormProps) {
  const basePrice = Number.parseFloat(formData.base_price) || 0
  const visibleGroups = groups.filter((g) => !g.isDeleted)
  const totalPricingGroup = findTotalPricingGroup(groups)
  const [badgeInput, setBadgeInput] = useState('')

  return (
    <div className="flex flex-col gap-3.5">
      {/* A: Info básica */}
      <div className="rounded-2xl border border-ink/[0.06] bg-card p-4">
        <div className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          A · Información básica
        </div>

        <div className="mb-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: input asociado como hermano */}
          <label className={labelCls}>Foto del plato</label>
          <div className="flex items-center gap-3">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="Foto del plato"
                className="h-[72px] w-[72px] shrink-0 rounded-xl border border-ink/[0.06] object-cover"
              />
            ) : (
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl bg-surface-low">
                <Icon name="photo_camera" size={22} className="text-ink-subtle" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label
                className={`block cursor-pointer ${imageBusy ? 'pointer-events-none opacity-50' : ''}`}
              >
                <span className="inline-flex h-9 items-center gap-2 rounded-full border border-ink/[0.08] bg-card px-3 text-sm font-bold text-ink transition-all active:scale-[0.97] hover:bg-surface">
                  <Icon name="upload" size={14} />
                  {imageBusy ? 'Optimizando…' : imageSrc ? 'Reemplazar' : 'Subir foto'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={imageBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onPickImage(f)
                  }}
                />
              </label>
              {imageSrc && (
                <button
                  type="button"
                  onClick={onClearImage}
                  className="text-left text-[12px] font-semibold text-danger"
                >
                  Quitar foto
                </button>
              )}
            </div>
          </div>
          {imageError && <p className="mt-1.5 text-[12px] text-danger">{imageError}</p>}
        </div>

        <div className="mb-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: input asociado como hermano */}
          <label className={labelCls}>Nombre del plato</label>
          <input
            className={`${inputCls} font-semibold`}
            value={formData.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            placeholder="Ej: Pizza Hawaiana"
          />
        </div>

        <div className="mb-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: textarea asociada como hermana */}
          <label className={labelCls}>Descripción (opcional)</label>
          <textarea
            className={`${inputCls} min-h-20 resize-none leading-normal`}
            value={formData.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="Ingredientes y características del plato"
          />
        </div>

        <div className="mb-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: input asociado como hermano */}
          <label className={labelCls}>Etiquetas (badges)</label>
          {formData.badges.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {formData.badges.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-semibold text-brand-dark"
                >
                  {b}
                  <button
                    type="button"
                    onClick={() => onFormChange({ badges: formData.badges.filter((x) => x !== b) })}
                    aria-label={`Quitar ${b}`}
                    className="inline-flex text-inherit"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {BADGE_PRESETS.filter((p) => !formData.badges.includes(p)).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onFormChange({ badges: [...formData.badges, p] })}
                className="inline-flex h-8 items-center rounded-full bg-ink/[0.06] px-3 text-[13px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
              >
                + {p}
              </button>
            ))}
            <input
              className={`${inputCls} min-w-[120px] flex-1 text-[13px]`}
              value={badgeInput}
              onChange={(e) => setBadgeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const v = badgeInput.trim()
                  if (v && !formData.badges.includes(v)) {
                    onFormChange({ badges: [...formData.badges, v] })
                  }
                  setBadgeInput('')
                }
              }}
              placeholder="Etiqueta libre + Enter"
            />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: select asociado como hermano */}
            <label className={labelCls}>Categoría</label>
            <div className="relative">
              <select
                className={`${inputCls} appearance-none pr-8`}
                value={formData.category_id}
                onChange={(e) => onFormChange({ category_id: e.target.value })}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <Icon name="expand_more" size={18} className="text-ink-muted" />
              </div>
            </div>
          </div>
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: input asociado como hermano */}
            <label className={labelCls}>Precio base (S/)</label>
            <div className="relative">
              <input
                className={`${inputMonoCls} text-[18px] font-bold ${
                  totalPricingGroup ? 'pr-10 text-ink-muted' : ''
                }`}
                type="number"
                min={0}
                step={0.5}
                value={formData.base_price}
                onChange={(e) => onFormChange({ base_price: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
                readOnly={totalPricingGroup !== undefined}
              />
              {totalPricingGroup && (
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                  <Icon name="lock" size={16} className="text-ink-subtle" />
                </div>
              )}
            </div>
            {totalPricingGroup ? (
              <div className="mt-1 text-[11px] text-info">
                Lo define &ldquo;{totalPricingGroup.name || 'el grupo'}&rdquo;: es el precio de su
                opción más barata.
              </div>
            ) : (
              visibleGroups.length > 0 && (
                <div className="mt-1 text-[11px] text-ink-muted">
                  Debe ser el precio de la opción más barata del grupo principal.
                </div>
              )
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {(
            [
              {
                key: 'is_available' as const,
                label: 'Disponible',
                sub: 'Aparece en el menú del cliente',
                icon: 'toggle_on',
              },
              {
                key: 'is_compact' as const,
                label: 'Destacado',
                sub: 'Se muestra primero y con badge',
                icon: 'star',
              },
            ] as const
          ).map((t) => {
            const on = formData[t.key]
            return (
              <div key={t.key} className="flex items-center gap-3 rounded-xl bg-surface p-2.5">
                <Icon
                  name={t.icon}
                  size={18}
                  filled
                  className={on ? 'text-brand' : 'text-ink-subtle'}
                />
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-ink">{t.label}</div>
                  <div className="text-[11px] text-ink-muted">{t.sub}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onFormChange({ [t.key]: !on })}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-ink/30'}`}
                  aria-label={on ? `Desactivar ${t.label}` : `Activar ${t.label}`}
                >
                  <span
                    className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform ${
                      on ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* B: Modifier groups */}
      <div className="rounded-2xl border border-ink/[0.06] bg-card p-4">
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
            B · Grupos de opciones
          </div>
          <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold text-ink">
            {visibleGroups.length} grupo{visibleGroups.length !== 1 ? 's' : ''}
          </span>
          {visibleGroups.length === 0 && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
              Directo al carrito
            </span>
          )}
        </div>

        {visibleGroups.length === 0 && (
          <div className="mb-3.5 rounded-xl border border-ink/[0.06] bg-surface p-4 text-center">
            <Icon name="shopping_cart" size={28} className="mx-auto text-success" />
            <div className="mt-2 text-[14px] font-bold text-ink">Sin modificadores</div>
            <div className="mx-auto mt-1 max-w-[320px] text-[12px] text-ink-muted">
              Se agrega al carrito sin abrir ningún modal. Ideal para bebidas y platos simples.
            </div>
          </div>
        )}

        {visibleGroups.map((g, i) => (
          <ModifierGroupCard
            key={g.localId}
            group={g}
            index={i}
            total={visibleGroups.length}
            basePrice={basePrice}
            totalPricingTakenBy={
              totalPricingGroup && totalPricingGroup.localId !== g.localId
                ? totalPricingGroup.name || 'otro grupo'
                : null
            }
            onToggleExpand={() => onGroupToggleExpand(g.localId)}
            onChange={(patch) => onGroupChange(g.localId, patch)}
            onPriceDisplayChange={(mode) => onGroupPriceDisplayChange(g.localId, mode)}
            onDelete={() => onGroupDelete(g.localId)}
            onAddOption={() => onGroupAddOption(g.localId)}
            onDeleteOption={(optLocalId) => onGroupDeleteOption(g.localId, optLocalId)}
            onChangeOption={(optLocalId, patch) =>
              onGroupChangeOption(g.localId, optLocalId, patch)
            }
            onMoveOption={(optLocalId, dir) => onGroupMoveOption(g.localId, optLocalId, dir)}
            onMoveUp={() => onGroupMoveUp(i)}
            onMoveDown={() => onGroupMoveDown(i)}
          />
        ))}

        <AddGroupButton onClick={onAddGroup} />

        <div className="mt-2.5 rounded-xl bg-surface p-2.5 text-[12px] leading-relaxed text-ink-muted">
          <strong>Default al crear un grupo:</strong> &ldquo;Obligatorio, elegir 1&rdquo;. Los
          grupos se evalúan en orden para el cliente.
        </div>
      </div>

      <PriceWarningCard basePrice={basePrice} groups={groups} />
      <PriceLiveSummary basePrice={basePrice} groups={groups} />
      <DangerZone itemName={formData.name} isNew={isNew} onDelete={onDeleteItem} />
    </div>
  )
}
