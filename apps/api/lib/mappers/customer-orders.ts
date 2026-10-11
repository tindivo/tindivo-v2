/**
 * Pedidos de comida del cliente, tal como los ve él en su historial y en el
 * detalle. Dinero como texto (D-39). Las columnas internas (comisiones, riesgo,
 * notas del negocio y del motorizado, validación) NO están aquí: lo que no se
 * pide no se filtra por descuido.
 */

const text = (soles: number | string): string => (Math.round(Number(soles) * 100) / 100).toFixed(2)
const textOrNull = (soles: number | string | null): string | null =>
  soles === null ? null : text(soles)

export interface OrderItemRow {
  item_name_snapshot: string
  quantity: number
  line_total: number
  note?: string | null
  created_at?: string
  customer_order_item_modifiers?: {
    group_name_snapshot: string
    option_name_snapshot: string
    additional_price_snapshot: number
    created_at: string
  }[]
}

export interface OrderSummaryRow {
  id: string
  short_id: string
  order_number: number
  status: string
  delivery_method: string
  payment_intent: string
  cancel_reason: string | null
  business_id: string
  order_amount: number
  delivery_fee: number
  created_at: string
  delivered_at: string | null
  customer_order_items: OrderItemRow[]
}

export interface OrderDetailRow extends OrderSummaryRow {
  customer_notes: string | null
  delivery_address: string | null
  delivery_reference: string | null
  delivery_coordinates_lat: number | null
  delivery_coordinates_lng: number | null
  client_pays_with: number | null
  change_to_give: number | null
  estimated_ready_at: string | null
  arrived_at_customer_at: string | null
  proof_attempt: number
  payment_verified_at: string | null
  driver_id: string | null
}

export const ORDER_SUMMARY_COLUMNS =
  'id,short_id,order_number,status,delivery_method,payment_intent,cancel_reason,business_id,order_amount,delivery_fee,created_at,delivered_at,customer_order_items(item_name_snapshot,quantity,line_total,created_at)' as const

export const ORDER_DETAIL_COLUMNS =
  'id,short_id,order_number,status,delivery_method,payment_intent,cancel_reason,business_id,order_amount,delivery_fee,created_at,delivered_at,customer_notes,delivery_address,delivery_reference,delivery_coordinates_lat,delivery_coordinates_lng,client_pays_with,change_to_give,estimated_ready_at,arrived_at_customer_at,proof_attempt,payment_verified_at,driver_id,customer_order_items(item_name_snapshot,quantity,line_total,note,created_at,customer_order_item_modifiers(group_name_snapshot,option_name_snapshot,additional_price_snapshot,created_at))' as const

const byCreatedAt = <T extends { created_at?: string }>(a: T, b: T): number =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '')

function base(row: OrderSummaryRow, businessName: string | null) {
  const totalCents =
    Math.round(Number(row.order_amount) * 100) + Math.round(Number(row.delivery_fee) * 100)
  return {
    id: row.id,
    shortId: row.short_id,
    orderNumber: row.order_number,
    status: row.status,
    deliveryMethod: row.delivery_method,
    paymentIntent: row.payment_intent,
    cancelReason: row.cancel_reason,
    businessId: row.business_id,
    businessName,
    amount: text(row.order_amount),
    deliveryFee: text(row.delivery_fee),
    total: (totalCents / 100).toFixed(2),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  }
}

export function toOrderSummaryDto(row: OrderSummaryRow, businessName: string | null) {
  return {
    ...base(row, businessName),
    items: [...row.customer_order_items].sort(byCreatedAt).map((i) => ({
      name: i.item_name_snapshot,
      quantity: i.quantity,
      lineTotal: text(i.line_total),
    })),
  }
}

export function toOrderDetailDto(
  row: OrderDetailRow,
  businessName: string | null,
  driver: { name: string; phone: string } | null,
) {
  const hasPoint = row.delivery_coordinates_lat !== null && row.delivery_coordinates_lng !== null
  return {
    ...base(row, businessName),
    items: [...row.customer_order_items].sort(byCreatedAt).map((i) => ({
      name: i.item_name_snapshot,
      quantity: i.quantity,
      lineTotal: text(i.line_total),
      note: i.note ?? null,
      modifiers: [...(i.customer_order_item_modifiers ?? [])].sort(byCreatedAt).map((m) => ({
        group: m.group_name_snapshot,
        name: m.option_name_snapshot,
        price: text(m.additional_price_snapshot),
      })),
    })),
    customerNotes: row.customer_notes,
    deliveryAddress: row.delivery_address,
    deliveryReference: row.delivery_reference,
    deliveryCoordinates: hasPoint
      ? {
          lat: Number(row.delivery_coordinates_lat),
          lng: Number(row.delivery_coordinates_lng),
        }
      : null,
    paysWith: textOrNull(row.client_pays_with),
    changeToGive: textOrNull(row.change_to_give),
    estimatedReadyAt: row.estimated_ready_at,
    arrivedAtCustomerAt: row.arrived_at_customer_at,
    proofAttempt: row.proof_attempt,
    paymentVerifiedAt: row.payment_verified_at,
    // El teléfono, como en `get_tracking`: solo cuando ya llegó a la puerta.
    driver: driver
      ? { name: driver.name, phone: row.arrived_at_customer_at !== null ? driver.phone : null }
      : null,
  }
}
