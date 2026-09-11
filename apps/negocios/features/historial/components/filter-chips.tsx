'use client'

import { FilterChips as ChipsCompartidos, type FilterChipOption } from '@/components/filter-chips'
import type { HistFilter } from '../types'

/**
 * El vocabulario del historial. El dibujo vive en `components/filter-chips`,
 * que comparte con el filtro de canal del tablero — lo común subió cuando el
 * patrón llegó a su tercer uso, no antes.
 */
const filters: readonly FilterChipOption<HistFilter>[] = [
  { id: 'all', label: 'Todos' },
  { id: 'delivered', label: 'Entregados' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'web', label: 'Web' },
  { id: 'manual', label: 'Manual' },
]

export function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: HistFilter
  counts: Record<HistFilter, number>
  onChange: (f: HistFilter) => void
}) {
  return <ChipsCompartidos options={filters} active={active} counts={counts} onChange={onChange} />
}
