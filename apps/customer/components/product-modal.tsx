'use client'

import { useMemo, useState } from 'react'
import type { CartModifier } from '@/lib/cart'
import { BottomSheet, Icon } from './ui'

export interface ModOption {
  id: string
  name: string
  description: string | null
  additional_price: number
}
export interface ModGroupData {
  id: string
  name: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  options: ModOption[]
}
export interface ProductItem {
  id: string
  name: string
  description: string | null
  base_price: number
  image_hue: number | null
  modifier_groups?: ModGroupData[]
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`

export function ProductModal({
  item,
  onClose,
  onAdd,
}: {
  item: ProductItem
  onClose: () => void
  onAdd: (line: {
    itemId: string
    name: string
    unitPrice: number
    quantity: number
    modifiers: CartModifier[]
    note: string | null
    hue: number
  }) => void
}) {
  const groups = item.modifier_groups ?? []
  const [single, setSingle] = useState<Record<string, string>>({})
  const [multi, setMulti] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const selectedOptions = useMemo<ModOption[]>(() => {
    const out: ModOption[] = []
    for (const g of groups) {
      if (g.selection_type === 'single') {
        const opt = g.options.find((o) => o.id === single[g.id])
        if (opt) out.push(opt)
      } else {
        for (const id of multi[g.id] ?? []) {
          const opt = g.options.find((o) => o.id === id)
          if (opt) out.push(opt)
        }
      }
    }
    return out
  }, [groups, single, multi])

  const missing = groups.filter((g) => {
    if (!g.is_required) return false
    return g.selection_type === 'single'
      ? !single[g.id]
      : (multi[g.id] ?? []).length < Math.max(1, g.min_selections)
  })
  const valid = missing.length === 0
  const unitPrice =
    item.base_price + selectedOptions.reduce((s, o) => s + Number(o.additional_price), 0)
  const total = unitPrice * qty
  const hue = item.image_hue ?? 14

  function toggle(g: ModGroupData, opt: ModOption) {
    if (g.selection_type === 'single') {
      setSingle((s) => ({ ...s, [g.id]: opt.id }))
    } else {
      setMulti((m) => {
        const cur = m[g.id] ?? []
        if (cur.includes(opt.id)) return { ...m, [g.id]: cur.filter((x) => x !== opt.id) }
        if (g.max_selections != null && cur.length >= g.max_selections) return m
        return { ...m, [g.id]: [...cur, opt.id] }
      })
    }
  }

  function add() {
    const modifiers: CartModifier[] = groups.flatMap((g) => {
      if (g.selection_type === 'single') {
        const opt = g.options.find((o) => o.id === single[g.id])
        return opt
          ? [
              {
                groupName: g.name,
                optionName: opt.name,
                optionId: opt.id,
                price: Number(opt.additional_price),
              },
            ]
          : []
      }
      return (multi[g.id] ?? []).flatMap((id) => {
        const opt = g.options.find((o) => o.id === id)
        return opt
          ? [
              {
                groupName: g.name,
                optionName: opt.name,
                optionId: opt.id,
                price: Number(opt.additional_price),
              },
            ]
          : []
      })
    })
    onAdd({
      itemId: item.id,
      name: item.name,
      unitPrice,
      quantity: qty,
      modifiers,
      note: note.trim() || null,
      hue,
    })
  }

  return (
    <BottomSheet open onClose={onClose}>
      {/* Hero */}
      <div className="relative">
        <div
          className="t-ph-image flex h-[200px] w-full items-center justify-center"
          style={{ borderRadius: 0, background: `oklch(0.92 0.04 ${hue})` }}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 11,
              color: `oklch(0.35 0.1 ${hue})`,
              letterSpacing: '0.06em',
              position: 'relative',
              zIndex: 1,
            }}
          >
            [ {item.name.toUpperCase()} ]
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
          aria-label="Cerrar"
        >
          <Icon.Close />
        </button>
      </div>

      <div className="t-scroll flex-1">
        <div className="px-5 pt-5 pb-1.5">
          <div className="t-display text-[26px] leading-[1.1]">{item.name}</div>
          {item.description && (
            <div
              className="mt-2 text-[14px] leading-[1.45]"
              style={{ color: 'rgba(26,22,20,0.65)' }}
            >
              {item.description}
            </div>
          )}
          <div className="mt-3 font-semibold text-[18px]">Desde {soles(item.base_price)}</div>
        </div>

        <div className="px-5 pt-3">
          {groups.map((g) => {
            const isSingle = g.selection_type === 'single'
            const count = isSingle ? (single[g.id] ? 1 : 0) : (multi[g.id] ?? []).length
            const isMissing = missing.includes(g)
            return (
              <div
                key={g.id}
                className="mt-3.5 rounded-[18px] bg-white p-4"
                style={{
                  border: isMissing ? '1px solid #F97316' : '1px solid rgba(26,22,20,0.05)',
                }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="t-display text-[17px]">{g.name}</div>
                  {g.is_required ? (
                    <span
                      className="rounded-md px-2 py-1 font-bold text-[10px] uppercase"
                      style={
                        count > 0
                          ? { background: 'rgba(26,150,80,0.12)', color: '#1A8050' }
                          : { background: 'rgba(249,115,22,0.1)', color: '#F97316' }
                      }
                    >
                      {count > 0 ? 'Listo' : 'Obligatorio'}
                    </span>
                  ) : !isSingle ? (
                    <span className="text-[12px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
                      {count}/{g.max_selections ?? '∞'}
                    </span>
                  ) : null}
                </div>
                <div className="mb-3 text-[12px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
                  {isSingle ? 'Elige una opción' : `Hasta ${g.max_selections ?? '∞'}`}
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.options.map((opt) => {
                    const sel = isSingle
                      ? single[g.id] === opt.id
                      : (multi[g.id] ?? []).includes(opt.id)
                    const disabled =
                      !isSingle &&
                      !sel &&
                      g.max_selections != null &&
                      (multi[g.id] ?? []).length >= g.max_selections
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggle(g, opt)}
                        disabled={disabled}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-3 text-left disabled:opacity-40"
                        style={{ background: sel ? 'rgba(249,115,22,0.06)' : 'transparent' }}
                      >
                        <span
                          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center"
                          style={{
                            borderRadius: isSingle ? 999 : 7,
                            border: `2px solid ${sel ? '#F97316' : 'rgba(26,22,20,0.25)'}`,
                            background: !isSingle && sel ? '#F97316' : 'transparent',
                            color: '#fff',
                          }}
                        >
                          {isSingle
                            ? sel && (
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ background: '#F97316' }}
                                />
                              )
                            : sel && <Icon.Check />}
                        </span>
                        <span className="flex-1">
                          <span className="block font-medium text-[15px]">{opt.name}</span>
                          {opt.description && (
                            <span
                              className="block text-[12px]"
                              style={{ color: 'rgba(26,22,20,0.55)' }}
                            >
                              {opt.description}
                            </span>
                          )}
                        </span>
                        <span
                          className="font-medium text-[14px]"
                          style={{
                            color:
                              Number(opt.additional_price) > 0 ? '#1A1614' : 'rgba(26,22,20,0.45)',
                          }}
                        >
                          {Number(opt.additional_price) > 0
                            ? `+${soles(Number(opt.additional_price))}`
                            : 'Incluido'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="mt-[18px] mb-4">
            <span className="t-field-label">Nota especial (opcional)</span>
            <textarea
              className="t-field"
              placeholder="Ej. sin cebolla, bien cocido, tocar timbre 2 veces…"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-1 text-right text-[11px]" style={{ color: 'rgba(26,22,20,0.4)' }}>
              {note.length}/140
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center gap-3 border-border border-t bg-surface px-4 pt-3.5 pb-6">
        <div className="t-qty">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Menos"
          >
            <Icon.Minus />
          </button>
          <span className="val">{qty}</span>
          <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Más">
            <Icon.Plus />
          </button>
        </div>
        <button
          type="button"
          className="t-btn t-btn-primary flex-1"
          disabled={!valid}
          onClick={add}
        >
          {valid
            ? `Agregar · ${soles(total)}`
            : `Completa ${missing.length} ${missing.length === 1 ? 'opción' : 'opciones'}`}
        </button>
      </div>
    </BottomSheet>
  )
}
