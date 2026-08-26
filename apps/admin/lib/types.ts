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
  /** Conteo por método de pago REAL sobre lo entregado. Los métodos sin pedidos
   *  en el rango no vienen: el `group by` de la RPC ya los deja fuera. */
  byPaymentReal?: { method: string; count: number }[]
  /** Embudo del primer pedido prepago (la regla de 0057). Ver 0116 para lo que
   *  NO mide: el abandono en el checkout no deja fila en la base. */
  prepayFunnel?: {
    attempts: number
    customers: number
    customersConverted: number
    delivered: number
    prepayTimeout: number
    validationTimeout: number
    proofRejected: number
    otherCancelled: number
    inProgress: number
    conversionPct: number
  }
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

/**
 * Consumo de la promo de envío gratis (0187). Viene de `/admin/promo`.
 *
 * `configured: false` significa que la key `promo_free_delivery` no existe en
 * `app_settings` — no hay promo montada, y el resto de campos no vienen. Es
 * distinto de `activa: false`, que es una promo montada y apagada.
 */
export interface PromoStats {
  configured: boolean
  code?: string
  activa?: boolean
  from?: string
  to?: string
  maxRedemptions?: number
  /** reserved + redeemed: lo que ya consume tope. Misma expresión que el candado. */
  comprometidos?: number
  cuposRestantes?: number
  redimidos?: number
  /** Primer pedido histórico del cliente (prior_delivered_count = 0). */
  clientesNuevos?: number
  clientesRecurrentes?: number
  /** Reservas en vuelo: pedido creado, todavía no entregado ni cancelado. */
  enCurso?: number
  /** Cancelados: devolvieron el cupo al cliente y al tope. */
  liberados?: number
  costoPromo?: number
}
