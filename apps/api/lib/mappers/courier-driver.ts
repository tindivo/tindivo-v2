import type {
  CourierPaymentMethod,
  CourierStatus,
  DriverCourierOrderView,
} from '@tindivo/contracts'

/** Columnas de `courier_orders` que necesita la tarjeta del motorizado. */
export const DRIVER_COURIER_COLUMNS =
  'id,short_id,status,driver_id,requester_name,origin_name,origin_phone,origin_lat,origin_lng,origin_reference_text,destination_name,destination_phone,destination_lat,destination_lng,destination_reference_text,item_description,is_fragile,payer,fee_amount,transport_collected_at,payment_method,created_at,accepted_at' as const

export interface DriverCourierRow {
  id: string
  short_id: string
  status: string
  driver_id: string | null
  requester_name: string
  origin_name: string
  origin_phone: string | null
  origin_lat: number | string
  origin_lng: number | string
  origin_reference_text: string
  destination_name: string
  destination_phone: string | null
  destination_lat: number | string
  destination_lng: number | string
  destination_reference_text: string
  item_description: string
  is_fragile: boolean
  payer: 'origin' | 'destination'
  fee_amount: number | string
  transport_collected_at: string | null
  payment_method: string | null
  created_at: string
  accepted_at: string | null
}

/**
 * Fila → tarjeta. `withPhones` solo es true para las entregas del propio
 * motorizado: una disponible muestra dónde y qué, no a quién llamar.
 */
export function toDriverCourierView(
  row: DriverCourierRow,
  withPhones: boolean,
): DriverCourierOrderView {
  return {
    id: row.id,
    shortId: row.short_id,
    status: row.status as CourierStatus,
    requesterName: row.requester_name,
    origin: {
      name: row.origin_name,
      phone: withPhones ? row.origin_phone : null,
      referenceText: row.origin_reference_text,
      coordinates: { lat: Number(row.origin_lat), lng: Number(row.origin_lng) },
    },
    destination: {
      name: row.destination_name,
      phone: withPhones ? row.destination_phone : null,
      referenceText: row.destination_reference_text,
      coordinates: { lat: Number(row.destination_lat), lng: Number(row.destination_lng) },
    },
    itemDescription: row.item_description,
    isFragile: row.is_fragile,
    payer: row.payer,
    feeAmount: Number(row.fee_amount),
    transportCollected: row.transport_collected_at !== null,
    paymentMethod: (row.payment_method as CourierPaymentMethod | null) ?? null,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }
}
