/** Métricas agregadas del dashboard (RPC admin_metrics). `series` se añade en backend (Fase 2). */
export interface Metrics {
  kpis: {
    orders: number
    delivered: number
    inProgress: number
    cancelled: number
    cancelledPct: number
    gmv: number
    commission: number
    avgTicket: number
    avgMinutes: number
    onTimePct: number
    cash: number
  }
  monitor: {
    pendingAcceptance: number
    waitingDriver: number
    headingToRestaurant: number
    pickedUp: number
  }
  byBusiness: {
    name: string
    total: number
    delivered: number
    cancelled: number
    gmv: number
    commission: number
  }[]
  byDriver: { name: string; deliveries: number; inProgress: number; gmv: number }[]
  byCancelReason: { reason: string; count: number }[]
  series?: { bucket: string; gmv: number; commission: number; orders: number; cancelled: number }[]
}

export interface OrderRow {
  id: string
  short_id: string
  order_number: number
  status: string
  customer_name: string | null
  order_amount: number
  tindivo_commission: number | null
  delivery_method: string
  payment_intent: string
  client_pays_with: number | null
  change_to_give: number | null
  created_at: string
}
