import type { OrderVM } from '@/lib/orders/view-model'

export type ColumnFilter = 'all' | 'delivery' | 'pickup' | 'manual'

export interface ColumnFilterOption {
  id: ColumnFilter
  label: string
  shortLabel: string
  icon: string
}

export const COLUMN_FILTER_OPTIONS: readonly ColumnFilterOption[] = [
  { id: 'all', label: 'Todos', shortLabel: 'Todos', icon: 'format_list_bulleted' },
  { id: 'delivery', label: 'Delivery', shortLabel: 'Delivery', icon: 'delivery_dining' },
  { id: 'pickup', label: 'Recojo', shortLabel: 'Recojo', icon: 'storefront' },
  { id: 'manual', label: 'Manual / Directo', shortLabel: 'Manual', icon: 'call' },
]

/** Comprueba si un pedido cumple el filtro de columna seleccionado. */
export function matchesColumnFilter(o: OrderVM, filter: ColumnFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'delivery') return o.method === 'delivery'
  if (filter === 'pickup') return o.method === 'pickup'
  if (filter === 'manual') return o.source === 'manual'
  return true
}

/** Calcula los contadores de cada filtro a partir del array real de pedidos de la columna. */
export function calculateColumnFilterCounts(
  orders: readonly OrderVM[],
): Record<ColumnFilter, number> {
  let delivery = 0
  let pickup = 0
  let manual = 0

  for (const o of orders) {
    if (o.method === 'delivery') delivery++
    if (o.method === 'pickup') pickup++
    if (o.source === 'manual') manual++
  }

  return {
    all: orders.length,
    delivery,
    pickup,
    manual,
  }
}
