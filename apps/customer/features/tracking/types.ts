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
  /**
   * Minutos que tiene el NEGOCIO para confirmar disponibilidad, de
   * `app_settings.timers` (0172). Ojo: hasta esa migración esta clave decía 15
   * mientras los crons cancelaban a los 5. Ahora dice 5, que es la verdad.
   */
  acceptanceMinutes?: number
  /**
   * Minutos que tiene el CLIENTE para yapear y subir la captura, de
   * `app_settings.timers` (0172). Son 15, no 10: los 10 son el plazo de la
   * cajera para revisarla (`prepayVerificationMinutes`). Confundirlos le
   * recortaría al cliente un tercio de su ventana.
   */
  paymentMinutes?: number
  /**
   * Minutos que tiene la cajera para validar el comprobante, de
   * `app_settings.timers` (0170). Es editable desde /admin/configuracion, así
   * que el cliente NO puede tenerlo escrito a mano: su cuenta atrás se
   * calculaba con un 10 fijo y habría mentido en cuanto alguien lo cambiara.
   */
  prepayVerificationMinutes?: number
  amount: number
  deliveryFee: number
  total: number
  createdAt?: string | null
  /**
   * Cuándo entró en `pending_acceptance` (0172). No es intercambiable con
   * `createdAt`: un pedido que pasó antes por `validando` lleva entre las dos
   * marcas los minutos que tardó la cajera, y contar desde `createdAt` le
   * restaría ese tiempo a la ventana del negocio.
   */
  pendingAcceptanceAt?: string | null
  awaitingPaymentAt?: string | null
  validatingAt?: string | null
  proofAttempt?: number
  proofUrl?: string | null
  /**
   * Cuándo el negocio dio el pago por recibido. Es la única señal fiable de que
   * el dinero del cliente ya salió: desde la 0181 la cajera puede confirmarlo
   * contra su propia cuenta, así que puede haber pago SIN captura y `proofUrl`
   * dejó de servir para responder esa pregunta.
   */
  paymentVerifiedAt?: string | null
  items: TrackingItem[]
}

export interface CancelState {
  confirmCancel: boolean
  setConfirmCancel: (value: boolean) => void
  cancelling: boolean
  doCancel: () => Promise<void>
}
