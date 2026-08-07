import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { priceWarning } from '../lib/utils'
import type { ModifierGroup } from '../types'

interface PriceWarningCardProps {
  basePrice: number
  groups: ModifierGroup[]
}

export function PriceWarningCard({ basePrice, groups }: PriceWarningCardProps) {
  const warn = priceWarning(
    basePrice,
    groups.filter((g) => !g.isDeleted),
  )
  if (!warn) return null
  return (
    <div className="flex gap-3 rounded-xl bg-warning/10 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-warning">
      <Icon name="info" size={18} filled className="mt-0.5 shrink-0" />
      <span>
        <strong>Revisa el precio base.</strong> El precio base es{' '}
        <span className="font-mono font-bold">{soles(warn.current)}</span> pero la opción más barata
        del grupo &ldquo;{warn.groupName}&rdquo; tiene un precio adicional de{' '}
        <span className="font-mono font-bold">+{soles(warn.delta)}</span>. Considera ajustarlo a{' '}
        <span className="font-mono font-bold">{soles(warn.suggested)}</span> para que el cliente vea
        el precio mínimo correcto.
      </span>
    </div>
  )
}
