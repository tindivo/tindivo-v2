import { soles } from '@/components/dashboard/primitives'
import { itemMaxPrice, itemMinPrice } from '../lib/utils'
import type { ModifierGroup } from '../types'

interface PriceLiveSummaryProps {
  basePrice: number
  groups: ModifierGroup[]
}

export function PriceLiveSummary({ basePrice, groups }: PriceLiveSummaryProps) {
  const visibleGroups = groups.filter((g) => !g.isDeleted)
  if (visibleGroups.length === 0) return null
  const minP = itemMinPrice(basePrice, groups)
  const maxP = itemMaxPrice(basePrice, groups)

  return (
    <div className="rounded-2xl bg-surface p-3.5">
      <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
        Resumen de precios
      </div>
      <div className="flex flex-wrap gap-5">
        <div>
          <div className="mb-0.5 text-[11px] text-ink-muted">Precio base</div>
          <div className="font-mono text-[18px] font-bold text-ink">{soles(basePrice)}</div>
        </div>
        <div>
          <div className="mb-0.5 text-[11px] text-ink-muted">Mínimo cliente paga</div>
          <div className="font-mono text-[18px] font-bold text-success">{soles(minP)}</div>
        </div>
        <div>
          <div className="mb-0.5 text-[11px] text-ink-muted">Máximo con extras</div>
          <div className="font-mono text-[18px] font-bold text-ink-muted">{soles(maxP)}</div>
        </div>
      </div>
    </div>
  )
}
