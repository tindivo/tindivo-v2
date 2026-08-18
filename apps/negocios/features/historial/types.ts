import type { OrderRow, UiPayment, UiSource } from '@/lib/orders/view-model'

export type HistFilter = 'all' | 'delivered' | 'cancelled' | 'web' | 'manual'

/** Fila cruda tal como viene de Supabase (alineada con OrderRow). */
export type HistRow = OrderRow

/** Versión lista para pintar en la UI. */
export interface HistDisplay {
  id: string
  shortId: string
  status: string
  source: UiSource
  customer: string
  total: number
  payment: UiPayment
  closedAt: string | null
  cancelReason: string | null
  isCancel: boolean
}
