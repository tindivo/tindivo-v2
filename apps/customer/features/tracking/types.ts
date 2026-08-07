export interface TrackingItemModifier {
  group: string
  name: string
  price: number
}

export interface TrackingItem {
  name: string
  qty: number
  lineTotal: number
  /** Snapshots de adicionales (get_tracking, migración 0041). */
  modifiers?: TrackingItemModifier[]
}

export interface Tracking {
  shortId: string
  orderNumber: number
  businessName: string
  status: string
  deliveryMethod: string
  paymentIntent: string
  cancelReason: string | null
  hasAppeal?: boolean
  appealStatus?: string | null
  refundStatus?: string | null
  refundAmount?: number | null
  cancelledAt?: string | null
  /** Efectivo: con cuánto paga el cliente y su vuelto (migración 0042). */
  paysWith?: number | null
  changeToGive?: number | null
  estimatedReadyAt: string | null
  driverName: string | null
  arrivedAtCustomerAt?: string | null
  driverPhone?: string | null
  /** La cajera declaró la comida lista antes de tiempo (0109). `estimated_ready_at`
   *  NO se toca en ese caso, así que sin este flag el ETA anunciaría minutos de
   *  cocción para comida ya hecha. */
  readyEarlyUsed?: boolean
  readyEarlyAt?: string | null
  /** Rango de trayecto publicado, de `app_settings.timers` (0117). */
  travelMinutes?: { min: number; max: number }
  amount: number
  deliveryFee: number
  total: number
  proofAttempt?: number
  proofUrl?: string | null
  items: TrackingItem[]
}

export interface CancelState {
  confirmCancel: boolean
  setConfirmCancel: (value: boolean) => void
  cancelling: boolean
  doCancel: () => Promise<void>
}
