'use client'

import { useMemo, useState } from 'react'
import type { ModGroupData, ModOption, ProductItem } from '@/features/catalog/types'
import type { CartModifier } from '@/lib/cart'

export interface ProductLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  modifiers: CartModifier[]
  note: string | null
  hue: number
  imageUrl: string | null
}

export function useProductOptions(item: ProductItem) {
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

  function buildLine(): ProductLine {
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

    return {
      itemId: item.id,
      name: item.name,
      unitPrice,
      quantity: qty,
      modifiers,
      note: note.trim() || null,
      hue,
      imageUrl: item.image_url,
    }
  }

  return {
    groups,
    single,
    multi,
    qty,
    setQty,
    note,
    setNote,
    selectedOptions,
    missing,
    valid,
    unitPrice,
    total,
    hue,
    toggle,
    buildLine,
  }
}
