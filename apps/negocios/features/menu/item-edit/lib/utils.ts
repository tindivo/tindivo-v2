import type { ModifierGroup, RuleMode } from '../types'

export function validateProductImage(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Formato no permitido. Usa JPG, PNG o WebP.'
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'La imagen supera el máximo de 5 MB.'
  }
  return null
}

export function ruleToMode(g: ModifierGroup): RuleMode {
  if (g.is_required && g.max_selections === 1) return 'required-one'
  if (g.is_required && (g.max_selections ?? 2) > 1) return 'required-many'
  if (!g.is_required && g.max_selections === 1) return 'optional-one'
  return 'optional-many'
}

export function modeToRule(
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
        max_selections: prevMax && prevMax > 1 ? prevMax : 3,
        selection_type: 'multi',
      }
    case 'optional-one':
      return { is_required: false, min_selections: 0, max_selections: 1, selection_type: 'single' }
    case 'optional-many':
      return {
        is_required: false,
        min_selections: 0,
        max_selections: prevMax && prevMax > 1 ? prevMax : 3,
        selection_type: 'multi',
      }
  }
}

export function groupRuleLabel(g: ModifierGroup): string {
  if (g.is_required) {
    if (g.max_selections === 1) return 'Obligatorio · elegir 1'
    return `Obligatorio · elegir ${g.min_selections}–${g.max_selections ?? '?'}`
  }
  if (g.max_selections === 1) return 'Opcional · elegir 1'
  return `Opcional · hasta ${g.max_selections ?? '?'}`
}

export function itemMinPrice(basePrice: number, groups: ModifierGroup[]): number {
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

export function itemMaxPrice(basePrice: number, groups: ModifierGroup[]): number {
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

export function priceWarning(
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

export function makeLocalId() {
  return Math.random().toString(36).slice(2)
}
