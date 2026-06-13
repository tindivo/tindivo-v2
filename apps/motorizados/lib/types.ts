/** Tipos del dominio visto por el motorizado. */

export type DriverOrderStatus =
  | 'preparing'
  | 'waiting_driver'
  | 'heading_to_restaurant'
  | 'waiting_at_restaurant'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'

export type PaymentIntent = 'prepaid' | 'pending_yape' | 'pending_cash' | 'pending_mixed'
export type OrderSource = 'customer_pwa' | 'business_manual'
export type TransitionAction = 'take' | 'arrived' | 'pickup' | 'deliver' | 'no_show'

/** Fila del board (lectura directa de supabase con RLS del driver). */
export interface BoardOrder {
  id: string
  short_id: string
  status: string
  source: string
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_reference: string | null
  order_amount: number
  delivery_fee: number
  payment_intent: string
  driver_id: string | null
  created_at: string
  estimated_ready_at: string | null
  urgent_since: string | null
  appears_in_queue_at: string | null
  occupancy_slots: number
  waiting_at_restaurant_at: string | null
  delivered_at: string | null
  client_pays_with: number | null
  change_to_give: number | null
  business_id: string
  businesses: { name: string } | null
}

/** Respuesta de GET /driver/orders/[id]. */
export interface OrderDetailResponse {
  order: {
    id: string
    shortId: string
    orderNumber: number
    status: string
    source: string
    isManual: boolean
    deliveryMethod: string
    deliveryDistanceBand: string | null
    customerName: string | null
    customerPhone: string | null
    deliveryAddress: string | null
    deliveryReference: string | null
    deliveryCoordinatesLat: number | null
    deliveryCoordinatesLng: number | null
    orderAmount: number
    deliveryFee: number
    paymentIntent: string
    paymentReal: string | null
    yapeAmount: number | null
    cashAmount: number | null
    clientPaysWith: number | null
    changeToGive: number | null
    occupancySlots: number
    urgentSince: string | null
    prepTimeMinutes: number | null
    estimatedReadyAt: string | null
    appearsInQueueAt: string | null
    headingAt: string | null
    waitingAtRestaurantAt: string | null
    pickedUpAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
    cancelReason: string | null
    customerNotes: string | null
    businessNotes: string | null
    driverNotes: string | null
    createdAt: string
  }
  items: {
    id: string
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
    note: string | null
    modifiers: { group: string; option: string; additionalPrice: number }[]
  }[]
  business: {
    id: string
    name: string
    address: string | null
    phone: string | null
    coordinatesLat: number | null
    coordinatesLng: number | null
    yapeNumber: string | null
    qrUrl: string | null
  } | null
  isPreview: boolean
  transfer: {
    incoming: { id: string; expiresAt: string | null } | null
    outgoing: { id: string; expiresAt: string | null } | null
  }
}

/** Respuesta de GET /driver/team. */
export interface TeamResponse {
  teamOrders: {
    orderId: string
    shortId: string
    status: string
    source: string
    total: number
    occupancySlots: number
    urgentSince: string | null
    driver: { id: string; fullName: string; vehicleType: string } | null
    businessName: string | null
    transferable: boolean
  }[]
  sentRequests: {
    id: string
    orderId: string
    shortId: string | null
    status: string
    expiresAt: string | null
    createdAt: string
  }[]
  receivedRequests: {
    id: string
    orderId: string
    shortId: string | null
    total: number | null
    businessName: string | null
    requesterName: string
    reason: string | null
    expiresAt: string | null
  }[]
}

/** Fila realtime de order_transfer_requests. */
export interface TransferRequestRow {
  id: string
  order_id: string
  from_driver_id: string
  to_driver_id: string
  status: string
  expires_at: string | null
  created_at: string
}
