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
export type TransitionAction =
  | 'take'
  | 'arrived'
  | 'pickup'
  | 'arrived_customer'
  | 'deliver'
  | 'no_show'

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
  /** La cajera declaró la comida lista. Se muestra como distintivo en la tarjeta. */
  ready_early_used: boolean | null
  ready_early_at: string | null
  urgent_since: string | null
  appears_in_queue_at: string | null
  occupancy_slots: number
  waiting_at_restaurant_at: string | null
  /** Cuándo recogiste. Es el origen del reloj de reparto. Ver `CardOrder`. */
  picked_up_at: string | null
  delivered_at: string | null
  /** Cómo se cobró de verdad, y cuánto efectivo quedó a deber. Ver `CardOrder`. */
  payment_real: string | null
  cash_owed_at_delivery: number | null
  client_pays_with: number | null
  change_to_give: number | null
  /** Desglose del pago mixto. Ver la nota en `CardOrder`. */
  cash_amount: number | null
  yape_amount: number | null
  business_id: string
  /**
   * Local resuelto desde `driver_businesses()` (0120), no desde un embed: las
   * policies de `businesses` no dejan al motorizado leer la tabla, así que
   * `businesses(name)` volvía NULL y todas las tarjetas decían "Restaurante".
   */
  business: DriverBusiness | null
}

/**
 * Lo ÚNICO que `OrderCard` lee de un pedido.
 *
 * Existe para que la pestaña Equipo pueda usar la misma tarjeta que Disponibles
 * y Míos sin arrastrar todo `BoardOrder`, que sale de una lectura directa de
 * `orders` con RLS y trae campos que de un pedido AJENO no deben viajar.
 *
 * `BoardOrder` lo satisface estructuralmente, así que Disponibles y Míos siguen
 * pasando su objeto tal cual: no cambia ni una línea en esas dos bandejas.
 *
 * Los campos que un pedido de equipo NO puede aportar van como nullables a
 * propósito —`customer_name`, `estimated_ready_at`, `payment_intent`—: la
 * tarjeta ya sabe no pintarlos, y así el tipo documenta qué es opcional en vez
 * de obligar a inventar valores de relleno.
 */
export interface CardOrder {
  id: string
  short_id: string
  status: string
  source: string
  /**
   * Cuándo se creó. En las bandejas propias no se pinta —ahí manda el reloj de
   * cocina—, pero en Equipo es el único anclaje honesto para un pedido que
   * todavía no se ha recogido: cuánto lleva esperando el cliente.
   */
  created_at: string
  customer_name: string | null
  delivery_address: string | null
  delivery_reference: string | null
  order_amount: number
  delivery_fee: number
  payment_intent: string | null
  change_to_give: number | null
  /**
   * Billete con el que paga el cliente. Hace falta para DERIVAR el vuelto:
   * `change_to_give` llega NULL en los pedidos manuales. Ver `lib/payment.ts`.
   */
  client_pays_with: number | null
  /**
   * Desglose del pago mixto (`orders.cash_amount` / `orders.yape_amount`,
   * existen desde 0002).
   *
   * El board del motorizado no los pedía, y la tarjeta pasaba `cashAmount:
   * null` a pelo a `changeDue`. Consecuencia: en un pago mixto la parte en
   * efectivo salía 0, `changeDue` devolvía siempre `null` y **el vuelto de un
   * mixto no se mostraba nunca** — el caso que más necesita el desglose era el
   * único que no podía darlo. `apps/negocios` ya los leía.
   */
  cash_amount: number | null
  yape_amount: number | null
  /** Huecos de mochila que consume. Puede ser 2: la tarjeta lo avisa. */
  occupancy_slots: number
  estimated_ready_at: string | null
  ready_early_used: boolean | null
  urgent_since: string | null
  /**
   * Cuándo se recogió el pedido. Es el origen del RELOJ DE REPARTO: con la
   * comida encima el reloj de cocina ya no dice nada, pero sí importa cuánto
   * lleva esperando el cliente — y con dos o tres pedidos en la mochila, cuál
   * lleva más tiempo rodando es justo lo que decide a quién entregar primero.
   *
   * No viaja en los pedidos de equipo, como el resto de los tiempos.
   */
  picked_up_at: string | null
  delivered_at: string | null
  /**
   * Cómo se cobró DE VERDAD (`orders.payment_real`), una vez entregado.
   *
   * MANDA SOBRE `payment_intent` EN EL HISTORIAL, y por eso hace falta aquí. Sin
   * él la tarjeta describía la intención para siempre: un pedido planeado en
   * efectivo que el cliente acabó pagando por Yape seguía diciendo "efectivo"
   * en el resumen del turno, y el motorizado veía un cobro que no hizo.
   */
  payment_real: string | null
  /** Efectivo que quedó a deber por este pedido (0140). Lo que se rinde. */
  cash_owed_at_delivery: number | null
  business: DriverBusiness | null
}

/** Local asignado al motorizado, con lo justo para trabajar (0120). */
export interface DriverBusiness {
  id: string
  name: string
  phone: string | null
  address: string | null
  accent_color: string | null
  coordinates_lat: number | null
  coordinates_lng: number | null
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
    /** Efectivo que quedó a deber por este pedido (0140). Lo que se rinde. */
    cashOwedAtDelivery: number | null
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
    arrivedAtCustomerAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
    cancelReason: string | null
    customerNotes: string | null
    businessNotes: string | null
    driverNotes: string | null
    readyEarlyUsed: boolean
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
    accentColor: string | null
    logoUrl: string | null
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
    /**
     * Edad del pedido. Da el reloj de las tarjetas que todavía se pueden pedir
     * ("Voy al local", "En el local"): cuánto lleva esperando el cliente.
     */
    createdAt: string
    /**
     * El reloj de la tarjeta "En reparto", igual que en la bandeja propia.
     *
     * Los dos son tiempos de un pedido ajeno y los dos viajan a propósito.
     * `estimated_ready_at` sigue sin hacerlo, y esa es la línea: dice CUÁNDO
     * ESTARÁ LISTA la comida, que es lo que permitiría pedir solo lo ya listo y
     * dejarle lo lento al compañero. Estos dos solo dicen cuánto lleva
     * esperando alguien.
     */
    pickedUpAt: string | null
    driver: { id: string; fullName: string; vehicleType: string } | null
    businessName: string | null
    /** Dónde va. Único dato del cliente que viaja: decide si te queda de camino. */
    deliveryReference: string | null
    accentColor: string | null
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
    /** Dónde va. Es un pedido PROPIO, así que aquí sí viaja: en 30 segundos el
     *  código corto no basta para reconocerlo, la dirección sí. */
    deliveryReference: string | null
    requesterName: string
    reason: string | null
    expiresAt: string | null
    /** Con `expiresAt` delimita la ventana real de la solicitud. Ver el endpoint. */
    createdAt: string
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
