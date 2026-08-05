import type { UiPayment, UiSource } from '@/lib/orders/view-model'

export type HistFilter = 'all' | 'delivered' | 'cancelled' | 'web' | 'manual'

/** Fila cruda tal como viene de Supabase. */
export interface HistRow {
  id: string
  short_id: string
  status: string
  source: string
  customer_name: string | null
  order_amount: number
  delivery_fee: number
  payment_intent: string
  delivered_at: string | null
  cancelled_at: string | null
  cancel_note: string | null
  created_at: string
}

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
