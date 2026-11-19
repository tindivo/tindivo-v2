import { PaymentProofStatusSchema } from '@tindivo/contracts'
import { CustomerOrderDetailSchema } from '@tindivo/contracts/openapi'
import { describe, expect, it } from 'vitest'
import {
  ORDER_DETAIL_COLUMNS,
  type OrderDetailRow,
  toOrderDetailDto,
  toOrderSummaryDto,
} from '../mappers/customer-orders'

/**
 * `paymentProofStatus` en el detalle del pedido del cliente (aditivo).
 * La app distingue «comprobante rechazado» de «aún sin revisar» en `prepay_timeout`.
 * Solo el estado: ni `proof_url`, ni la cajera, ni el motivo del rechazo.
 */

function row(extra: Partial<OrderDetailRow> = {}): OrderDetailRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    short_id: 'ABCD2345',
    order_number: 7,
    status: 'pending',
    delivery_method: 'delivery',
    payment_intent: 'prepaid',
    cancel_reason: null,
    business_id: '22222222-2222-4222-8222-222222222222',
    order_amount: 20,
    delivery_fee: 3,
    created_at: '2026-11-16T15:00:00.000Z',
    delivered_at: null,
    customer_order_items: [],
    customer_notes: null,
    delivery_address: null,
    delivery_reference: null,
    delivery_coordinates_lat: null,
    delivery_coordinates_lng: null,
    client_pays_with: null,
    change_to_give: null,
    estimated_ready_at: null,
    arrived_at_customer_at: null,
    proof_attempt: 1,
    payment_verified_at: null,
    payment_proof_status: null,
    driver_id: null,
    pending_acceptance_at: null,
    validating_at: null,
    ...extra,
  }
}

describe('paymentProofStatus en el detalle del pedido', () => {
  it.each(['pending', 'verified', 'rejected'] as const)('lleva «%s» tal cual', (status) => {
    const dto = toOrderDetailDto(row({ payment_proof_status: status }), 'La Florencia', null, null)
    expect(dto.paymentProofStatus).toBe(status)
    expect(CustomerOrderDetailSchema.safeParse(dto).success).toBe(true)
  })

  it('null y ausente salen como null', () => {
    expect(toOrderDetailDto(row(), null, null, null).paymentProofStatus).toBeNull()
    const sinColumna = row()
    // biome-ignore lint/performance/noDelete: simula una fila sin la columna
    delete (sinColumna as Partial<OrderDetailRow>).payment_proof_status
    expect(toOrderDetailDto(sinColumna, null, null, null).paymentProofStatus).toBeNull()
  })

  it('no filtra proof_url ni datos de quien revisó', () => {
    const dto = toOrderDetailDto(
      row({ payment_proof_status: 'rejected' }),
      null,
      null,
      null,
    ) as Record<string, unknown>
    expect(Object.keys(dto).filter((k) => /proof(Url|_url)|reject|cashier/i.test(k))).toEqual([])
    expect(ORDER_DETAIL_COLUMNS).not.toMatch(/proof_url|reject_reason|cashier/)
  })

  it('la lista no trae el campo', () => {
    expect(toOrderSummaryDto(row(), null)).not.toHaveProperty('paymentProofStatus')
  })

  it('el enum cerrado acepta los 3 valores y rechaza lo demás', () => {
    for (const v of ['pending', 'verified', 'rejected']) {
      expect(PaymentProofStatusSchema.safeParse(v).success).toBe(true)
    }
    expect(PaymentProofStatusSchema.safeParse('foo').success).toBe(false)
    expect(PaymentProofStatusSchema.safeParse(null).success).toBe(false)
  })
})
