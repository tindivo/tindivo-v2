import { soles } from '@/components/dashboard/primitives'
import type { MenuItem } from '../types'

export function itemMinPrice(item: MenuItem): number {
  let extra = 0
  for (const g of item.modifierGroups) {
    if (g.is_required && g.options.length > 0) {
      const prices = g.options.filter((o) => o.is_available).map((o) => o.additional_price)
      if (prices.length > 0) {
        extra += Math.min(...prices)
      }
    }
  }
  return item.base_price + extra
}

export function itemMaxPrice(item: MenuItem): number {
  let extra = 0
  for (const g of item.modifierGroups) {
    const sorted = g.options
      .filter((o) => o.additional_price > 0)
      .map((o) => o.additional_price)
      .sort((a, b) => b - a)
    const maxSel = g.max_selections ?? sorted.length
    extra += sorted.slice(0, maxSel).reduce((a, b) => a + b, 0)
  }
  return item.base_price + extra
}

export function formatItemPrice(item: MenuItem): string {
  const minP = itemMinPrice(item)
  const maxP = itemMaxPrice(item)
  return minP === maxP ? soles(minP) : `${soles(minP)} – ${soles(maxP)}`
}

export function countAgotadoOptions(item: MenuItem): number {
  return item.modifierGroups.reduce(
    (n, g) => n + g.options.filter((o) => !o.is_available).length,
    0,
  )
}
