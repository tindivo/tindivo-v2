'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { DashboardSidebar } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────────────

type RuleMode = 'required-one' | 'required-many' | 'optional-one' | 'optional-many'

interface ModifierOption {
  id: string
  localId: string // temp key before DB save
  name: string
  additional_price: number
  is_available: boolean
  display_order: number
  isNew?: boolean
  isDeleted?: boolean
}

interface ModifierGroup {
  id: string
  localId: string
  name: string
  selection_type: 'single' | 'multiple'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  display_order: number
  options: ModifierOption[]
  isNew?: boolean
  isDeleted?: boolean
  isExpanded: boolean
}

interface FormData {
  name: string
  description: string
  category_id: string
  base_price: string
  is_available: boolean
  is_compact: boolean
}

interface Category {
  id: string
  name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ruleToMode(g: ModifierGroup): RuleMode {
  if (g.is_required && g.max_selections === 1) return 'required-one'
  if (g.is_required && (g.max_selections ?? 2) > 1) return 'required-many'
  if (!g.is_required && g.max_selections === 1) return 'optional-one'
  return 'optional-many'
}

function modeToRule(
  mode: RuleMode,
  prevMax: number | null,
): Pick<ModifierGroup, 'is_required' | 'min_selections' | 'max_selections' | 'selection_type'> {
  switch (mode) {
    case 'required-one':
      return { is_required: true, min_selections: 1, max_selections: 1, selection_type: 'single' }
    case 'required-many':
      return {
        is_required: true,
        min_selections: 1,
        max_selections: prevMax ?? 3,
        selection_type: 'multiple',
      }
    case 'optional-one':
      return { is_required: false, min_selections: 0, max_selections: 1, selection_type: 'single' }
    case 'optional-many':
      return {
        is_required: false,
        min_selections: 0,
        max_selections: prevMax ?? 3,
        selection_type: 'multiple',
      }
  }
}

function groupRuleLabel(g: ModifierGroup): string {
  if (g.is_required) {
    if (g.max_selections === 1) return 'Obligatorio · elegir 1'
    return `Obligatorio · elegir ${g.min_selections}–${g.max_selections ?? '?'}`
  }
  if (g.max_selections === 1) return 'Opcional · elegir 1'
  return `Opcional · hasta ${g.max_selections ?? '?'}`
}

function itemMinPrice(basePrice: number, groups: ModifierGroup[]): number {
  // min price = base + cheapest option from each required group
  let extra = 0
  for (const g of groups) {
    if (!g.isDeleted && g.is_required && g.options.length > 0) {
      const prices = g.options.filter((o) => !o.isDeleted).map((o) => o.additional_price)
      if (prices.length > 0) {
        extra += Math.min(...prices)
      }
    }
  }
  return basePrice + extra
}

function itemMaxPrice(basePrice: number, groups: ModifierGroup[]): number {
  let extra = 0
  for (const g of groups) {
    if (!g.isDeleted) {
      const sorted = g.options
        .filter((o) => !o.isDeleted && o.additional_price > 0)
        .map((o) => o.additional_price)
        .sort((a, b) => b - a)
      const maxSel = g.max_selections ?? sorted.length
      extra += sorted.slice(0, maxSel).reduce((a, b) => a + b, 0)
    }
  }
  return basePrice + extra
}

function priceWarning(
  basePrice: number,
  groups: ModifierGroup[],
): { current: number; suggested: number; groupName: string; delta: number } | null {
  const mainGroup = groups.find((g) => !g.isDeleted && g.is_required && g.min_selections >= 1)
  if (!mainGroup) return null
  const prices = mainGroup.options.filter((o) => !o.isDeleted).map((o) => o.additional_price)
  if (prices.length === 0) return null
  const cheapest = Math.min(...prices)
  if (cheapest === 0) return null
  return {
    current: basePrice,
    suggested: basePrice + cheapest,
    groupName: mainGroup.name,
    delta: cheapest,
  }
}

function makeLocalId() {
  return Math.random().toString(36).slice(2)
}

// ── Modals ───────────────────────────────────────────────────────────────────

function ConfirmDeleteModal({
  itemName,
  onConfirm,
  onCancel,
}: {
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '24px 22px',
          maxWidth: 360,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'var(--tv-danger-soft)',
            color: 'var(--tv-danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          <MS name="delete" size={26} filled />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
          {`¿Eliminar "${itemName}"?`}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--tv-ink-muted)',
            lineHeight: 1.5,
            marginBottom: 22,
          }}
        >
          Esta acción no se puede deshacer. El plato desaparecerá del menú y del historial de
          pedidos futuros.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" className="tv-btn tv-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="tv-btn tv-btn-danger" onClick={onConfirm}>
            <MS name="delete" size={16} />
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

function UnsavedChangesModal({
  onSaveAndExit,
  onDiscard,
  onCancel,
}: {
  onSaveAndExit: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '24px 22px',
          maxWidth: 360,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'var(--tv-warning-soft)',
            color: '#B45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          <MS name="edit_note" size={26} filled />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
          Tienes cambios sin guardar
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--tv-ink-muted)',
            lineHeight: 1.5,
            marginBottom: 22,
          }}
        >
          ¿Qué quieres hacer antes de salir?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="tv-btn tv-btn-brand tv-btn-block"
            onClick={onSaveAndExit}
          >
            <MS name="save" size={18} filled />
            Guardar y salir
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="tv-btn tv-btn-ghost" onClick={onCancel}>
              Seguir editando
            </button>
            <button
              type="button"
              className="tv-btn tv-btn-ghost"
              onClick={onDiscard}
              style={{ color: 'var(--tv-danger)' }}
            >
              Descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Customer preview (inline) ─────────────────────────────────────────────────

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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 12,
        border: selected ? '2px solid var(--tv-brand)' : '1.5px solid var(--tv-border)',
        background: selected ? 'var(--tv-brand-soft)' : '#fff',
        marginBottom: 6,
        opacity: opt.is_available ? 1 : 0.55,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: multi ? 6 : 999,
          flexShrink: 0,
          border: selected ? '2px solid var(--tv-brand)' : '2px solid var(--tv-border)',
          background: selected ? 'var(--tv-brand)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && <MS name="check" size={12} style={{ color: '#fff' }} />}
      </div>
      <span
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: selected ? 600 : 400,
          color: opt.is_available ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
          textDecoration: opt.is_available ? 'none' : 'line-through',
        }}
      >
        {opt.name}
        {!opt.is_available && (
          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--tv-ink-subtle)' }}>
            Agotado
          </span>
        )}
      </span>
      {opt.additional_price > 0 ? (
        <span
          className="tv-mono"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)', flexShrink: 0 }}
        >
          {`+${soles(opt.additional_price)}`}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--tv-success)', fontWeight: 600, flexShrink: 0 }}>
          Incluido
        </span>
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
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{group.name}</div>
          <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
            {ruleLabel}
          </div>
        </div>
        {isRequired ? (
          <span
            style={{
              background: '#FEF3C7',
              color: '#92400E',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 999,
            }}
          >
            Obligatorio
          </span>
        ) : (
          <span
            style={{
              background: 'var(--tv-surface)',
              color: 'var(--tv-ink-muted)',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 999,
            }}
          >
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

function CustomerPreviewPanel({
  formData,
  groups,
  style,
}: {
  formData: FormData
  groups: ModifierGroup[]
  style?: React.CSSProperties
}) {
  const basePrice = Number.parseFloat(formData.base_price) || 0
  const visibleGroups = groups.filter(
    (g) => !g.isDeleted && g.options.filter((o) => !o.isDeleted).length > 0,
  )

  // Dynamic mock price: base + first option of each required group
  const mockPrice = (() => {
    let price = basePrice
    for (const g of visibleGroups) {
      if (g.is_required) {
        const firstOpt = g.options.filter((o) => !o.isDeleted)[0]
        price += firstOpt?.additional_price ?? 0
      }
    }
    return price
  })()

  const minP = itemMinPrice(basePrice, groups)

  return (
    <div
      style={{
        background: 'var(--tv-surface)',
        borderRadius: 20,
        border: '1px solid var(--tv-border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Label bar */}
      <div
        style={{
          background: 'var(--tv-ink)',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <MS name="smartphone" size={16} filled />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Vista del cliente · PWA Tindivo</div>
      </div>

      {/* Content with independent scroll */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {/* Hero */}
        <div className="tv-ph" style={{ width: '100%', height: 180, borderRadius: 0 }}>
          <span>{formData.name.toUpperCase() || 'FOTO'}</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                {formData.name || 'Nombre del plato'}
              </div>
              {formData.description && (
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--tv-ink-muted)',
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {formData.description}
                </div>
              )}
            </div>
            <div
              className="tv-mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--tv-brand)',
                flexShrink: 0,
              }}
            >
              {soles(minP)}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--tv-border)', marginBottom: 16 }} />

          {visibleGroups.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 0',
                color: 'var(--tv-ink-muted)',
              }}
            >
              <MS name="shopping_cart" size={32} style={{ color: 'var(--tv-success)' }} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>Sin opciones adicionales</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Se agrega directamente al carrito.</div>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <CustomerModifierGroup key={group.localId} group={group} />
            ))
          )}
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          padding: '14px 18px 18px',
          borderTop: '1px solid var(--tv-border)',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: 3,
            }}
          >
            <button
              type="button"
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                border: 'none',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MS name="remove" size={16} />
            </button>
            <span
              className="tv-mono"
              style={{ minWidth: 30, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
            >
              1
            </span>
            <button
              type="button"
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                border: 'none',
                background: 'var(--tv-ink)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MS name="add" size={16} />
            </button>
          </div>
          <button
            type="button"
            style={{
              flex: 1,
              background: 'var(--tv-brand)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '14px 16px',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 14px -4px rgba(249,115,22,0.5)',
            }}
          >
            <span>Agregar al pedido</span>
            <span className="tv-mono">{soles(mockPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rule selector ─────────────────────────────────────────────────────────────

function GroupRuleSelector({
  group,
  onChange,
}: {
  group: ModifierGroup
  onChange: (patch: Partial<ModifierGroup>) => void
}) {
  const mode = ruleToMode(group)

  function handleModeChange(newMode: RuleMode) {
    const rules = modeToRule(newMode, group.max_selections)
    onChange(rules)
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="tv-label-input">TIPO DE SELECCIÓN</div>
      <div style={{ position: 'relative' }}>
        <select
          style={{
            width: '100%',
            appearance: 'none',
            background: '#fff',
            border: '1.5px solid var(--tv-border)',
            borderRadius: 12,
            padding: '12px 40px 12px 14px',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--tv-ink)',
            cursor: 'pointer',
            outline: 'none',
            lineHeight: 1.4,
          }}
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as RuleMode)}
        >
          <option value="required-one">Obligatorio, elegir 1</option>
          <option value="required-many">Obligatorio, elegir varios</option>
          <option value="optional-one">Opcional, elegir 1</option>
          <option value="optional-many">Opcional, elegir varios</option>
        </select>
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <MS name="expand_more" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
        </div>
      </div>
      {(mode === 'required-many' || mode === 'optional-many') && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--tv-surface)',
            borderRadius: 10,
            padding: '8px 12px',
          }}
        >
          <div className="tv-label-input" style={{ margin: 0 }}>
            MÁXIMO A ELEGIR
          </div>
          <input
            type="number"
            min={2}
            max={20}
            value={group.max_selections ?? 3}
            onChange={(e) => onChange({ max_selections: Number(e.target.value) || 3 })}
            className="tv-input tv-mono"
            style={{ width: 64, textAlign: 'center', fontWeight: 700, padding: '6px 10px' }}
          />
          <span style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>opciones</span>
        </div>
      )}
    </div>
  )
}

// ── Option row ────────────────────────────────────────────────────────────────

function ModifierOptionRow({
  opt,
  onChange,
  onDelete,
}: {
  opt: ModifierOption
  onChange: (patch: Partial<ModifierOption>) => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid var(--tv-border)',
        opacity: opt.is_available ? 1 : 0.55,
      }}
    >
      <MS
        name="drag_indicator"
        size={16}
        style={{ color: 'var(--tv-ink-subtle)', cursor: 'grab', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          className="tv-input"
          style={{
            padding: '7px 10px',
            fontSize: 14,
            background: 'var(--tv-surface)',
            borderRadius: 8,
          }}
          value={opt.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre de la opción"
        />
      </div>
      {/* + PRECIO column */}
      <div style={{ width: 90, flexShrink: 0 }}>
        <input
          type="number"
          min={0}
          step={0.5}
          className="tv-input tv-mono"
          style={{
            padding: '7px 10px',
            fontSize: 13,
            background: 'var(--tv-surface)',
            borderRadius: 8,
            textAlign: 'right',
            fontWeight: 600,
            color: opt.additional_price > 0 ? 'var(--tv-success)' : 'var(--tv-ink-muted)',
          }}
          value={opt.additional_price === 0 ? '' : opt.additional_price}
          placeholder="0"
          onChange={(e) => onChange({ additional_price: Number.parseFloat(e.target.value) || 0 })}
        />
      </div>
      {/* Availability toggle */}
      <button
        type="button"
        onClick={() => onChange({ is_available: !opt.is_available })}
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: opt.is_available ? 'var(--tv-success)' : 'var(--tv-ink-subtle)',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
        }}
        aria-label={opt.is_available ? 'Marcar como agotado' : 'Marcar como disponible'}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: opt.is_available ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#fff',
            transition: 'left 140ms ease',
          }}
        />
      </button>
      <button
        type="button"
        onClick={onDelete}
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--tv-danger-soft)',
          color: 'var(--tv-danger)',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Eliminar opción"
      >
        <MS name="close" size={14} />
      </button>
    </div>
  )
}

// ── Modifier group card ───────────────────────────────────────────────────────

function ModifierGroupCard({
  group,
  index,
  total,
  onToggleExpand,
  onChange,
  onDelete,
  onAddOption,
  onDeleteOption,
  onChangeOption,
  onMoveUp,
  onMoveDown,
}: {
  group: ModifierGroup
  index: number
  total: number
  onToggleExpand: () => void
  onChange: (patch: Partial<ModifierGroup>) => void
  onDelete: () => void
  onAddOption: () => void
  onDeleteOption: (optLocalId: string) => void
  onChangeOption: (optLocalId: string, patch: Partial<ModifierOption>) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const isRequired = group.is_required
  const visibleOptions = group.options.filter((o) => !o.isDeleted)

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `1.5px solid ${isRequired ? '#BFDBFE' : 'var(--tv-border)'}`,
        overflow: 'hidden',
        marginBottom: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          background: isRequired ? '#EFF6FF' : 'var(--tv-surface)',
          borderBottom: group.isExpanded ? '1px solid var(--tv-border)' : 'none',
        }}
      >
        <MS
          name="drag_indicator"
          size={18}
          style={{ color: 'var(--tv-ink-subtle)', cursor: 'grab', flexShrink: 0 }}
        />
        <button
          type="button"
          onClick={onToggleExpand}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>
            {group.name || 'Grupo sin nombre'}
          </div>
          <div
            style={{
              fontSize: 11,
              color: isRequired ? '#1D4ED8' : 'var(--tv-ink-muted)',
              marginTop: 2,
              fontWeight: 600,
            }}
          >
            {groupRuleLabel(group)}
          </div>
          {!group.isExpanded && (
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
              {visibleOptions.length} opciones
              {visibleOptions.filter((o) => !o.is_available).length > 0 &&
                ` · ${visibleOptions.filter((o) => !o.is_available).length} agotada/s`}
            </div>
          )}
        </button>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {index > 0 && (
            <button
              type="button"
              onClick={onMoveUp}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: 'rgba(26,22,20,0.06)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Subir grupo"
            >
              <MS name="arrow_upward" size={13} />
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              onClick={onMoveDown}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: 'rgba(26,22,20,0.06)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Bajar grupo"
            >
              <MS name="arrow_downward" size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--tv-danger-soft)',
              color: 'var(--tv-danger)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Eliminar grupo"
          >
            <MS name="delete" size={13} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={group.isExpanded ? 'Colapsar' : 'Expandir'}
          >
            <MS name={group.isExpanded ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        </div>
      </div>

      {group.isExpanded && (
        <div style={{ padding: '12px 14px 14px' }}>
          {/* Group name input */}
          <div style={{ marginBottom: 12 }}>
            <div className="tv-label-input">NOMBRE DEL GRUPO</div>
            <input
              className="tv-input"
              value={group.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Ej: Tamaño, Extras, Salsas"
            />
          </div>

          {/* Rule selector */}
          <GroupRuleSelector group={group} onChange={onChange} />

          {/* Options header */}
          <div className="tv-label" style={{ marginBottom: 6 }}>
            OPCIONES
          </div>
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 34px 28px',
                gap: 8,
                padding: '4px 0',
                marginLeft: 24,
              }}
            >
              <div className="tv-label" style={{ fontSize: 9 }}>
                NOMBRE
              </div>
              <div className="tv-label" style={{ fontSize: 9, textAlign: 'right' }}>
                + PRECIO
              </div>
              <div />
              <div />
            </div>
            {visibleOptions.map((opt) => (
              <ModifierOptionRow
                key={opt.localId}
                opt={opt}
                onChange={(patch) => onChangeOption(opt.localId, patch)}
                onDelete={() => onDeleteOption(opt.localId)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onAddOption}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 10,
              width: '100%',
              background: 'rgba(26,22,20,0.04)',
              border: '1.5px dashed var(--tv-border)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--tv-ink-muted)',
              justifyContent: 'center',
            }}
          >
            <MS name="add" size={15} />
            Agregar opción
          </button>
        </div>
      )}
    </div>
  )
}

// ── Price warning ─────────────────────────────────────────────────────────────

function PriceWarningCard({ basePrice, groups }: { basePrice: number; groups: ModifierGroup[] }) {
  const warn = priceWarning(
    basePrice,
    groups.filter((g) => !g.isDeleted),
  )
  if (!warn) return null
  return (
    <div
      style={{
        background: 'var(--tv-warning-soft)',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid #FDE68A',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <MS name="info" size={18} filled style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
        <strong>Revisa el precio base.</strong> El precio base es{' '}
        <span className="tv-mono" style={{ fontWeight: 700 }}>
          {soles(warn.current)}
        </span>{' '}
        pero la opción más barata del grupo "{warn.groupName}" tiene un precio adicional de{' '}
        <span className="tv-mono" style={{ fontWeight: 700 }}>
          {`+${soles(warn.delta)}`}
        </span>
        . Considera ajustarlo a{' '}
        <span className="tv-mono" style={{ fontWeight: 700 }}>
          {soles(warn.suggested)}
        </span>{' '}
        para que el cliente vea el precio mínimo correcto.
      </div>
    </div>
  )
}

// ── Price summary ─────────────────────────────────────────────────────────────

function PriceLiveSummary({ basePrice, groups }: { basePrice: number; groups: ModifierGroup[] }) {
  const visibleGroups = groups.filter((g) => !g.isDeleted)
  if (visibleGroups.length === 0) return null
  const minP = itemMinPrice(basePrice, groups)
  const maxP = itemMaxPrice(basePrice, groups)

  return (
    <div
      style={{
        background: 'var(--tv-surface)',
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div className="tv-label" style={{ marginBottom: 8 }}>
        RESUMEN DE PRECIOS
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>
            Precio base
          </div>
          <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>
            {soles(basePrice)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>
            Mínimo cliente paga
          </div>
          <div
            className="tv-mono"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-success)' }}
          >
            {soles(minP)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>
            Máximo con extras
          </div>
          <div
            className="tv-mono"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-ink-muted)' }}
          >
            {soles(maxP)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Danger zone ───────────────────────────────────────────────────────────────

function DangerZone({
  itemName,
  isNew,
  onDelete,
}: {
  itemName: string
  isNew: boolean
  onDelete: () => void
}) {
  if (isNew) return null
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '14px 16px',
        border: '1px solid #FCA5A5',
        background: '#FFF5F5',
      }}
    >
      <div
        className="tv-label"
        style={{ fontSize: 10, color: 'var(--tv-danger)', marginBottom: 10 }}
      >
        ZONA DE PELIGRO
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#7F1D1D' }}>Eliminar plato</div>
          <div style={{ fontSize: 12, color: '#9F1239', marginTop: 2 }}>
            Esta acción no se puede deshacer.
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="tv-btn tv-btn-sm"
          style={{
            background: 'var(--tv-danger)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MS name="delete" size={15} />
          {`Eliminar "${itemName || 'plato'}"`}
        </button>
      </div>
    </div>
  )
}

// ── Add group button ──────────────────────────────────────────────────────────

function AddGroupButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 14,
        width: '100%',
        background: 'var(--tv-brand-soft)',
        border: '2px solid var(--tv-brand)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--tv-brand-dark)',
        transition: 'background 120ms',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--tv-brand)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MS name="add" size={18} />
      </div>
      Agregar grupo de opciones
    </button>
  )
}

// ── Unsaved dot ───────────────────────────────────────────────────────────────

function UnsavedDot() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 999,
        background: 'var(--tv-brand)',
        marginLeft: 6,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  )
}

// ── Editor form (shared between mobile/desktop) ───────────────────────────────

function EditorForm({
  formData,
  cats,
  groups,
  isNew,
  onFormChange,
  onGroupChange,
  onGroupToggleExpand,
  onGroupDelete,
  onGroupAddOption,
  onGroupDeleteOption,
  onGroupChangeOption,
  onGroupMoveUp,
  onGroupMoveDown,
  onAddGroup,
  onDeleteItem,
}: {
  formData: FormData
  cats: Category[]
  groups: ModifierGroup[]
  isNew: boolean
  onFormChange: (patch: Partial<FormData>) => void
  onGroupChange: (localId: string, patch: Partial<ModifierGroup>) => void
  onGroupToggleExpand: (localId: string) => void
  onGroupDelete: (localId: string) => void
  onGroupAddOption: (groupLocalId: string) => void
  onGroupDeleteOption: (groupLocalId: string, optLocalId: string) => void
  onGroupChangeOption: (
    groupLocalId: string,
    optLocalId: string,
    patch: Partial<ModifierOption>,
  ) => void
  onGroupMoveUp: (index: number) => void
  onGroupMoveDown: (index: number) => void
  onAddGroup: () => void
  onDeleteItem: () => void
}) {
  const basePrice = Number.parseFloat(formData.base_price) || 0
  const visibleGroups = groups.filter((g) => !g.isDeleted)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* A: Info básica */}
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '16px 18px',
          border: '1px solid var(--tv-border)',
        }}
      >
        <div className="tv-label" style={{ marginBottom: 14 }}>
          A · INFORMACIÓN BÁSICA
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="tv-label-input">NOMBRE DEL PLATO</div>
          <input
            className="tv-input"
            style={{ fontSize: 15, fontWeight: 600 }}
            value={formData.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            placeholder="Ej: Pizza Hawaiana"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="tv-label-input">DESCRIPCIÓN (OPCIONAL)</div>
          <textarea
            className="tv-input"
            style={{ minHeight: 60, resize: 'none', lineHeight: 1.5, fontSize: 13 }}
            value={formData.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="Ingredientes y características del plato"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <div className="tv-label-input">CATEGORÍA</div>
            <div style={{ position: 'relative' }}>
              <select
                className="tv-input"
                style={{ appearance: 'none', paddingRight: 32 }}
                value={formData.category_id}
                onChange={(e) => onFormChange({ category_id: e.target.value })}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <MS name="expand_more" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
              </div>
            </div>
          </div>
          <div>
            <div className="tv-label-input">PRECIO BASE (S/)</div>
            <input
              className="tv-input tv-mono"
              style={{ fontSize: 18, fontWeight: 700 }}
              type="number"
              min={0}
              step={0.5}
              value={formData.base_price}
              onChange={(e) => onFormChange({ base_price: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
            />
            {visibleGroups.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--tv-ink-muted)',
                  marginTop: 4,
                }}
              >
                Debe ser el precio de la opción más barata del grupo principal.
              </div>
            )}
          </div>
        </div>

        {/* Disponible / Destacado toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <div
                key={t.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--tv-surface)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <MS
                  name={t.icon}
                  size={18}
                  filled={on}
                  style={{ color: on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
                    {t.sub}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onFormChange({ [t.key]: !on })}
                  style={{
                    width: 40,
                    height: 24,
                    borderRadius: 999,
                    background: on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                  aria-label={on ? `Desactivar ${t.label}` : `Activar ${t.label}`}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: on ? 19 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: '#fff',
                      transition: 'left 140ms ease',
                    }}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* B: Modifier groups */}
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '16px 18px',
          border: '1px solid var(--tv-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div className="tv-label" style={{ flex: 1 }}>
            B · GRUPOS DE OPCIONES
          </div>
          <span className="tv-chip" style={{ fontSize: 11 }}>
            {visibleGroups.length} grupo{visibleGroups.length !== 1 ? 's' : ''}
          </span>
          {visibleGroups.length === 0 && (
            <span
              style={{
                background: 'var(--tv-success-soft)',
                color: '#166534',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              Directo al carrito
            </span>
          )}
        </div>

        {visibleGroups.length === 0 && (
          <div
            style={{
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: '16px',
              textAlign: 'center',
              marginBottom: 14,
              border: '1px solid var(--tv-border)',
            }}
          >
            <MS name="shopping_cart" size={28} style={{ color: 'var(--tv-success)' }} />
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Sin modificadores</div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--tv-ink-muted)',
                marginTop: 4,
                maxWidth: 320,
                margin: '4px auto 0',
              }}
            >
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
            onToggleExpand={() => onGroupToggleExpand(g.localId)}
            onChange={(patch) => onGroupChange(g.localId, patch)}
            onDelete={() => onGroupDelete(g.localId)}
            onAddOption={() => onGroupAddOption(g.localId)}
            onDeleteOption={(optLocalId) => onGroupDeleteOption(g.localId, optLocalId)}
            onChangeOption={(optLocalId, patch) =>
              onGroupChangeOption(g.localId, optLocalId, patch)
            }
            onMoveUp={() => onGroupMoveUp(i)}
            onMoveDown={() => onGroupMoveDown(i)}
          />
        ))}

        <AddGroupButton onClick={onAddGroup} />

        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--tv-surface)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--tv-ink-muted)',
            lineHeight: 1.5,
          }}
        >
          <strong>Default al crear un grupo:</strong> "Obligatorio, elegir 1". Los grupos se evalúan
          en orden para el cliente.
        </div>
      </div>

      {/* C: Price warning */}
      <PriceWarningCard basePrice={basePrice} groups={groups} />

      {/* Price summary */}
      <PriceLiveSummary basePrice={basePrice} groups={groups} />

      {/* Danger zone */}
      <DangerZone itemName={formData.name} isNew={isNew} onDelete={onDeleteItem} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MenuItemEditorPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawId = params.id
  const itemId = typeof rawId === 'string' ? rawId : (rawId?.[0] ?? 'nuevo')
  const isNew = itemId === 'nuevo'
  const defaultCatId = searchParams.get('cat') ?? ''

  const [ready, setReady] = useState(false)
  const [bizId, setBizId] = useState<string | null>(null)
  const [bizName, setBizName] = useState('Mi negocio')
  const [accent, setAccent] = useState('#F472B6')
  const [pendingOrders, setPendingOrders] = useState(0)
  const [cats, setCats] = useState<Category[]>([])
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    category_id: defaultCatId,
    base_price: '',
    is_available: true,
    is_compact: false,
  })
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)
  const _pendingNavRef = useRef<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }

      const { data: biz } = await supabase
        .from('businesses')
        .select('id,name,accent_color')
        .maybeSingle()
      if (!biz?.id) {
        router.replace('/')
        return
      }
      setBizId(biz.id)
      setBizName(biz.name ?? 'Mi negocio')
      setAccent(biz.accent_color ? `#${biz.accent_color}` : '#F472B6')

      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'pending_acceptance')
      setPendingOrders(count ?? 0)

      // Load categories
      const { data: catsData } = await supabase
        .from('menu_categories')
        .select('id,name')
        .eq('business_id', biz.id)
        .order('display_order')
      setCats(catsData ?? [])

      if (!isNew) {
        // Load item
        const { data: item } = await supabase
          .from('menu_items')
          .select('id,name,description,category_id,base_price,is_available,is_compact')
          .eq('id', itemId)
          .eq('business_id', biz.id)
          .single()

        if (!item) {
          router.replace('/menu')
          return
        }

        setFormData({
          name: item.name,
          description: item.description ?? '',
          category_id: item.category_id,
          base_price: Number(item.base_price).toFixed(2),
          is_available: item.is_available,
          is_compact: item.is_compact,
        })

        // Load modifier groups + junction + options
        const { data: junctions } = await supabase
          .from('menu_item_modifier_groups')
          .select('group_id,display_order')
          .eq('item_id', itemId)
          .order('display_order')

        if (junctions && junctions.length > 0) {
          const groupIds = junctions.map((j) => j.group_id)
          const { data: groupsData } = await supabase
            .from('menu_modifier_groups')
            .select(
              'id,name,selection_type,is_required,min_selections,max_selections,display_order',
            )
            .in('id', groupIds)

          const { data: optionsData } = await supabase
            .from('menu_modifier_options')
            .select('id,group_id,name,additional_price,is_available,display_order')
            .in('group_id', groupIds)
            .order('display_order')

          const optsByGroup: Record<string, typeof optionsData> = {}
          for (const opt of optionsData ?? []) {
            const list = optsByGroup[opt.group_id] ?? []
            list.push(opt)
            optsByGroup[opt.group_id] = list
          }

          const loadedGroups: ModifierGroup[] = (junctions ?? []).flatMap((j) => {
            const g = (groupsData ?? []).find((x) => x.id === j.group_id)
            if (!g) return []
            const mg: ModifierGroup = {
              id: g.id,
              localId: g.id,
              name: g.name,
              selection_type: g.selection_type as 'single' | 'multiple',
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              display_order: j.display_order,
              isExpanded: false,
              options: (optsByGroup[g.id] ?? []).map((o) => ({
                id: o.id,
                localId: o.id,
                name: o.name,
                additional_price: Number(o.additional_price),
                is_available: o.is_available,
                display_order: o.display_order,
              })),
            }
            return [mg]
          })

          // Expand first group only
          if (loadedGroups[0]) {
            loadedGroups[0] = { ...loadedGroups[0], isExpanded: true }
          }

          setGroups(loadedGroups)
        }
      } else {
        // New item: set category from query param if available
        if (defaultCatId && (catsData ?? []).some((c) => c.id === defaultCatId)) {
          setFormData((prev) => ({ ...prev, category_id: defaultCatId }))
        } else if ((catsData ?? []).length > 0) {
          setFormData((prev) => ({ ...prev, category_id: (catsData ?? [])[0]?.id ?? '' }))
        }
      }

      setReady(true)
    })
  }, [router, itemId, isNew, defaultCatId])

  // ── Mark dirty on changes ─────────────────────────────────────────────────

  function patchForm(patch: Partial<FormData>) {
    setFormData((prev) => ({ ...prev, ...patch }))
    setHasUnsaved(true)
  }

  function patchGroup(localId: string, patch: Partial<ModifierGroup>) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, ...patch } : g)))
    setHasUnsaved(true)
  }

  function toggleGroupExpand(localId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.localId === localId ? { ...g, isExpanded: !g.isExpanded } : g)),
    )
  }

  function deleteGroup(localId: string) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, isDeleted: true } : g)))
    setHasUnsaved(true)
  }

  function addGroup() {
    const newGroup: ModifierGroup = {
      id: '',
      localId: makeLocalId(),
      name: '',
      selection_type: 'single',
      is_required: true,
      min_selections: 1,
      max_selections: 1,
      display_order: groups.filter((g) => !g.isDeleted).length,
      options: [],
      isNew: true,
      isExpanded: true,
    }
    setGroups((prev) => [...prev, newGroup])
    setHasUnsaved(true)
  }

  function addOptionToGroup(groupLocalId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        const newOpt: ModifierOption = {
          id: '',
          localId: makeLocalId(),
          name: '',
          additional_price: 0,
          is_available: true,
          display_order: g.options.filter((o) => !o.isDeleted).length,
          isNew: true,
        }
        return { ...g, options: [...g.options, newOpt] }
      }),
    )
    setHasUnsaved(true)
  }

  function deleteOption(groupLocalId: string, optLocalId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        return {
          ...g,
          options: g.options.map((o) => (o.localId === optLocalId ? { ...o, isDeleted: true } : o)),
        }
      }),
    )
    setHasUnsaved(true)
  }

  function changeOption(groupLocalId: string, optLocalId: string, patch: Partial<ModifierOption>) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        return {
          ...g,
          options: g.options.map((o) => (o.localId === optLocalId ? { ...o, ...patch } : o)),
        }
      }),
    )
    setHasUnsaved(true)
  }

  function moveGroupUp(index: number) {
    const visible = groups.filter((g) => !g.isDeleted)
    if (index === 0) return
    const above = visible[index - 1]
    const curr = visible[index]
    if (!above || !curr) return
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.localId === above.localId) return { ...g, display_order: curr.display_order }
          if (g.localId === curr.localId) return { ...g, display_order: above.display_order }
          return g
        })
        .sort((a, b) => a.display_order - b.display_order),
    )
    setHasUnsaved(true)
  }

  function moveGroupDown(index: number) {
    const visible = groups.filter((g) => !g.isDeleted)
    if (index >= visible.length - 1) return
    const below = visible[index + 1]
    const curr = visible[index]
    if (!below || !curr) return
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.localId === below.localId) return { ...g, display_order: curr.display_order }
          if (g.localId === curr.localId) return { ...g, display_order: below.display_order }
          return g
        })
        .sort((a, b) => a.display_order - b.display_order),
    )
    setHasUnsaved(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save(): Promise<boolean> {
    if (!bizId) return false
    setSaving(true)
    setSaveError(null)
    const supabase = getSupabaseBrowser()

    try {
      const priceVal = Number.parseFloat(formData.base_price)
      if (Number.isNaN(priceVal) || priceVal < 0) {
        setSaveError('El precio base debe ser un número válido.')
        setSaving(false)
        return false
      }
      if (!formData.name.trim()) {
        setSaveError('El nombre del plato es obligatorio.')
        setSaving(false)
        return false
      }

      // Upsert item
      let savedItemId = isNew ? '' : itemId
      if (isNew) {
        const { data: newItem, error: insertErr } = await supabase
          .from('menu_items')
          .insert({
            business_id: bizId,
            category_id: formData.category_id,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            base_price: priceVal,
            is_available: formData.is_available,
            is_compact: formData.is_compact,
            badges: [],
            display_order: 9999,
          })
          .select('id')
          .single()
        if (insertErr || !newItem) {
          setSaveError(insertErr?.message ?? 'Error al crear el plato.')
          setSaving(false)
          return false
        }
        savedItemId = newItem.id
      } else {
        const { error: updateErr } = await supabase
          .from('menu_items')
          .update({
            category_id: formData.category_id,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            base_price: priceVal,
            is_available: formData.is_available,
            is_compact: formData.is_compact,
          })
          .eq('id', itemId)
          .eq('business_id', bizId)
        if (updateErr) {
          setSaveError(updateErr.message)
          setSaving(false)
          return false
        }
      }

      // Save modifier groups
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]
        if (!g) continue

        if (g.isDeleted) {
          if (g.id) {
            // Delete options first, then group, then junction
            await supabase.from('menu_modifier_options').delete().eq('group_id', g.id)
            await supabase
              .from('menu_item_modifier_groups')
              .delete()
              .eq('group_id', g.id)
              .eq('item_id', savedItemId)
            await supabase.from('menu_modifier_groups').delete().eq('id', g.id)
          }
          continue
        }

        let groupId = g.id
        if (g.isNew || !g.id) {
          const { data: newGroup, error: gErr } = await supabase
            .from('menu_modifier_groups')
            .insert({
              business_id: bizId,
              name: g.name.trim() || 'Grupo',
              selection_type: g.selection_type,
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              display_order: g.display_order,
            })
            .select('id')
            .single()
          if (gErr || !newGroup) continue
          groupId = newGroup.id

          // Insert junction
          await supabase.from('menu_item_modifier_groups').insert({
            item_id: savedItemId,
            group_id: groupId,
            display_order: i,
          })
        } else {
          await supabase
            .from('menu_modifier_groups')
            .update({
              name: g.name.trim() || 'Grupo',
              selection_type: g.selection_type,
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              display_order: g.display_order,
            })
            .eq('id', groupId)

          // Update junction order
          await supabase
            .from('menu_item_modifier_groups')
            .update({ display_order: i })
            .eq('item_id', savedItemId)
            .eq('group_id', groupId)
        }

        // Save options
        for (let j = 0; j < g.options.length; j++) {
          const opt = g.options[j]
          if (!opt) continue

          if (opt.isDeleted) {
            if (opt.id) {
              await supabase.from('menu_modifier_options').delete().eq('id', opt.id)
            }
            continue
          }

          if (opt.isNew || !opt.id) {
            await supabase.from('menu_modifier_options').insert({
              group_id: groupId,
              name: opt.name.trim() || 'Opción',
              additional_price: opt.additional_price,
              is_available: opt.is_available,
              display_order: j,
            })
          } else {
            await supabase
              .from('menu_modifier_options')
              .update({
                name: opt.name.trim() || 'Opción',
                additional_price: opt.additional_price,
                is_available: opt.is_available,
                display_order: j,
              })
              .eq('id', opt.id)
          }
        }
      }

      setHasUnsaved(false)
      setSaving(false)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error desconocido')
      setSaving(false)
      return false
    }
  }

  async function handleSave() {
    const ok = await save()
    if (ok && isNew) {
      router.replace('/menu')
    }
  }

  async function handleDeleteItem() {
    if (!bizId || isNew) return
    setSaving(true)
    const supabase = getSupabaseBrowser()

    // Delete options, groups, junctions, then item
    const groupIds = groups.filter((g) => g.id).map((g) => g.id)
    if (groupIds.length > 0) {
      await supabase.from('menu_modifier_options').delete().in('group_id', groupIds)
      await supabase.from('menu_item_modifier_groups').delete().eq('item_id', itemId)
      await supabase.from('menu_modifier_groups').delete().in('id', groupIds)
    }
    await supabase.from('menu_items').delete().eq('id', itemId).eq('business_id', bizId)
    router.replace('/menu')
  }

  function handleBack() {
    if (hasUnsaved) {
      setShowUnsavedModal(true)
    } else {
      router.push('/menu')
    }
  }

  async function handleSaveAndExit() {
    const ok = await save()
    if (ok) router.push('/menu')
    else setShowUnsavedModal(false)
  }

  // ── Sign out ──────────────────────────────────────────────────────────────

  async function signOut() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/')
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          color: 'var(--tv-ink-muted)',
          fontSize: 14,
        }}
      >
        Cargando…
      </div>
    )
  }

  const title = isNew ? 'Nuevo plato' : `Editar · ${formData.name || 'plato'}`
  const _basePrice = Number.parseFloat(formData.base_price) || 0
  const _visibleGroups = groups.filter((g) => !g.isDeleted)

  // ── MOBILE ────────────────────────────────────────────────────────────────

  const mobileView = (
    <div
      className="lg:hidden flex flex-col"
      style={{
        height: '100dvh',
        background: 'var(--tv-surface)',
        position: 'relative',
      }}
    >
      {showDeleteModal && (
        <ConfirmDeleteModal
          itemName={formData.name}
          onConfirm={handleDeleteItem}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
      {showUnsavedModal && (
        <UnsavedChangesModal
          onSaveAndExit={handleSaveAndExit}
          onDiscard={() => router.push('/menu')}
          onCancel={() => setShowUnsavedModal(false)}
        />
      )}
      {showPreviewMobile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          {/* Bottom sheet */}
          <div
            style={{
              background: '#fff',
              borderRadius: '24px 24px 0 0',
              maxHeight: '88%',
              height: '88%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '10px 0 4px',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: '#D4D0CA',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 16px 10px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)' }}>
                Vista previa — así lo ve el cliente
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewMobile(false)}
                style={{
                  background: 'rgba(26,22,20,0.06)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
            <CustomerPreviewPanel
              formData={formData}
              groups={groups}
              style={{ flex: 1, borderRadius: 0 }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: '10px 14px 12px',
          background: '#fff',
          borderBottom: '1px solid var(--tv-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(26,22,20,0.06)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Volver al menú"
        >
          <MS name="arrow_back" size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="tv-display" style={{ fontSize: 17, lineHeight: 1.1 }}>
              {isNew ? 'Nuevo plato' : 'Editar plato'}
            </div>
            {hasUnsaved && <UnsavedDot />}
          </div>
          {formData.name && (
            <div className="tv-label" style={{ marginTop: 2 }}>
              {formData.name.toUpperCase()}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPreviewMobile(true)}
          className="tv-btn tv-btn-ghost tv-btn-sm"
        >
          <MS name="visibility" size={16} />
          Preview
        </button>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>
        {saveError && (
          <div
            style={{
              color: 'var(--tv-danger)',
              fontSize: 13,
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            {saveError}
          </div>
        )}
        <EditorForm
          formData={formData}
          cats={cats}
          groups={groups}
          isNew={isNew}
          onFormChange={patchForm}
          onGroupChange={patchGroup}
          onGroupToggleExpand={toggleGroupExpand}
          onGroupDelete={deleteGroup}
          onGroupAddOption={addOptionToGroup}
          onGroupDeleteOption={deleteOption}
          onGroupChangeOption={changeOption}
          onGroupMoveUp={moveGroupUp}
          onGroupMoveDown={moveGroupDown}
          onAddGroup={addGroup}
          onDeleteItem={() => setShowDeleteModal(true)}
        />
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          background: '#fff',
          borderTop: '1px solid var(--tv-border)',
          padding: '12px 14px 14px',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg"
        >
          <MS name="save" size={20} filled />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )

  // ── DESKTOP ───────────────────────────────────────────────────────────────

  const desktopView = (
    <div className="hidden lg:flex" style={{ height: '100dvh', background: 'var(--tv-surface)' }}>
      {showDeleteModal && (
        <ConfirmDeleteModal
          itemName={formData.name}
          onConfirm={handleDeleteItem}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
      {showUnsavedModal && (
        <UnsavedChangesModal
          onSaveAndExit={handleSaveAndExit}
          onDiscard={() => router.push('/menu')}
          onCancel={() => setShowUnsavedModal(false)}
        />
      )}

      {/* Sidebar — reuses DashboardSidebar */}
      <DashboardSidebar
        active="menu"
        bizName={bizName}
        accent={accent}
        pedidosBadge={pendingOrders}
        onSignOut={signOut}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div
          className="tv-glass"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 8,
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Volver al menú"
          >
            <MS name="arrow_back" size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="tv-display"
              style={{
                fontSize: 22,
                lineHeight: 1.1,
                display: 'flex',
                alignItems: 'center',
                gap: 0,
              }}
            >
              {title}
              {hasUnsaved && <UnsavedDot />}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--tv-ink-muted)',
                marginTop: 2,
              }}
            >
              Menú · {cats.find((c) => c.id === formData.category_id)?.name ?? 'Sin categoría'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="tv-btn tv-btn-brand"
          >
            <MS name="save" size={18} filled />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>

        {/* 3-col content: [form 1fr] [preview 340px] */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 20,
            alignItems: 'flex-start',
          }}
        >
          {/* Form */}
          <div>
            {saveError && (
              <div
                style={{
                  color: 'var(--tv-danger)',
                  fontSize: 13,
                  marginBottom: 12,
                  fontWeight: 600,
                }}
              >
                {saveError}
              </div>
            )}
            <EditorForm
              formData={formData}
              cats={cats}
              groups={groups}
              isNew={isNew}
              onFormChange={patchForm}
              onGroupChange={patchGroup}
              onGroupToggleExpand={toggleGroupExpand}
              onGroupDelete={deleteGroup}
              onGroupAddOption={addOptionToGroup}
              onGroupDeleteOption={deleteOption}
              onGroupChangeOption={changeOption}
              onGroupMoveUp={moveGroupUp}
              onGroupMoveDown={moveGroupDown}
              onAddGroup={addGroup}
              onDeleteItem={() => setShowDeleteModal(true)}
            />
          </div>

          {/* Right panel: autosave + preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Autosave indicator */}
            <div
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '12px 14px',
                border: '1px solid var(--tv-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {hasUnsaved ? (
                <>
                  <MS name="edit_note" size={18} style={{ color: 'var(--tv-warning)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                      Cambios sin guardar
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
                      Presiona "Guardar cambios" para confirmar
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <MS name="cloud_done" size={18} style={{ color: 'var(--tv-success)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {isNew ? 'Plato nuevo — no guardado' : 'Cambios guardados'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
                      {isNew
                        ? 'Completa el formulario y guarda'
                        : 'Todos los cambios están sincronizados'}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Customer preview — sticky, independent scroll */}
            <div
              style={{
                position: 'sticky',
                top: 0,
                height: 600,
                overflow: 'hidden',
              }}
            >
              <CustomerPreviewPanel
                formData={formData}
                groups={groups}
                style={{ height: '100%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {mobileView}
      {desktopView}
    </>
  )
}
