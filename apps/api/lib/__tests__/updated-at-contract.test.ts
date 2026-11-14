import { CustomerCourierOrderSchema, CustomerOrderSummarySchema } from '@tindivo/contracts/openapi'
import { describe, expect, it } from 'vitest'
import { type CourierRow, toCourierOrderDto } from '../customer/courier-history'
import { type OrderSummaryRow, toIsoUtc, toOrderSummaryDto } from '../mappers/customer-orders'

/**
 * `updatedAt` en las listas de pedidos y de Entregas (ampliación aditiva del contrato v1, aprobada por Jesús el
 * 2026-11-14): ISO 8601 en UTC con milisegundos, la misma conversión que `send-push` usa para el `seq` de un aviso.
 */
const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// Lo que entrega PostgREST: microsegundos y un desfase, no «Z».
const FROM_DB = '2026-11-14T05:00:00.123456-05:00'
const EXPECTED = '2026-11-14T10:00:00.123Z'

const orderRow: OrderSummaryRow = {
  id: '11111111-1111-4111-8111-111111111111',
  short_id: 'AB2C3D4E',
  order_number: 7,
  status: 'preparing',
  delivery_method: 'delivery',
  payment_intent: 'pending_cash',
  cancel_reason: null,
  business_id: '22222222-2222-4222-8222-222222222222',
  order_amount: 20,
  delivery_fee: 3,
  created_at: '2026-11-14T09:00:00.000000+00:00',
  updated_at: FROM_DB,
  delivered_at: null,
  customer_order_items: [],
}

const courierRow: CourierRow = {
  id: '33333333-3333-4333-8333-333333333333',
  short_id: 'ZZ9Y8X7W',
  order_number: 3,
  status: 'requested',
  cancel_reason: null,
  origin_name: 'Ana',
  origin_phone: null,
  origin_lat: -9.1,
  origin_lng: -77.5,
  origin_reference_text: 'Plaza',
  destination_name: null,
  destination_phone: null,
  destination_lat: -9.2,
  destination_lng: -77.6,
  destination_reference_text: 'Casa',
  item_description: 'Llaves',
  is_fragile: false,
  payer: 'sender',
  driver_id: null,
  fee_amount: 5,
  created_at: '2026-11-14T09:00:00.000000+00:00',
  updated_at: FROM_DB,
  delivered_at: null,
}

describe('updatedAt de las listas del cliente', () => {
  it('toIsoUtc da UTC con milisegundos y coincide con el seq de send-push (Date.parse truncado)', () => {
    expect(toIsoUtc(FROM_DB)).toBe(EXPECTED)
    expect(Date.parse(toIsoUtc(FROM_DB))).toBe(Math.trunc(Date.parse(FROM_DB)))
  })

  it('el pedido lo trae en ISO UTC y cumple el esquema del contrato', () => {
    const dto = toOrderSummaryDto(orderRow, 'Pollería Sabor')
    expect(dto.updatedAt).toMatch(ISO_UTC_MS)
    expect(dto.updatedAt).toBe(EXPECTED)
    expect(() => CustomerOrderSummarySchema.parse(dto)).not.toThrow()
  })

  it('la solicitud de Entregas lo trae en ISO UTC y cumple el esquema del contrato', () => {
    const dto = toCourierOrderDto(courierRow, null)
    expect(dto.updatedAt).toMatch(ISO_UTC_MS)
    expect(dto.updatedAt).toBe(EXPECTED)
    expect(() => CustomerCourierOrderSchema.parse(dto)).not.toThrow()
  })
})
