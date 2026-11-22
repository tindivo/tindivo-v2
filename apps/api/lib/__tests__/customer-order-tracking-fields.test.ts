import { CustomerOrderDetailSchema } from '@tindivo/contracts/openapi'
import { describe, expect, it } from 'vitest'
import { type OrderDetailRow, toOrderDetailDto } from '../mappers/customer-orders'

/**
 * Capacidad `seguimiento`: lo que el servidor le da al cliente para el tiempo y el motorizado.
 * CA-TRK-08: el cliente nunca recibe el teléfono del motorizado, ni con él en la puerta.
 * CA-TRK-04 y CA-TRK-05: las horas de inicio de los plazos y el trayecto viajan como campos opcionales.
 */

function row(extra: Partial<OrderDetailRow> = {}): OrderDetailRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    short_id: 'ABCD2345',
    order_number: 7,
    status: 'pending_acceptance',
    delivery_method: 'delivery',
    payment_intent: 'pending_cash',
    cancel_reason: null,
    business_id: '22222222-2222-4222-8222-222222222222',
    order_amount: 20,
    delivery_fee: 3,
    created_at: '2026-11-16T15:00:00.000Z',
    updated_at: '2026-11-16T15:00:00.000Z',
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
    proof_attempt: 0,
    payment_verified_at: null,
    payment_proof_status: null,
    driver_id: null,
    pending_acceptance_at: '2026-11-16T15:01:00.000Z',
    validating_at: null,
    ...extra,
  }
}

const TRAVEL = { min: 20, max: 25 }
// El motorizado como lo lee la base: con teléfono. El mapeo no debe dejarlo pasar.
const CARLOS = { name: 'Carlos Ramírez', phone: '+51987654321' }

describe('el motorizado en el detalle del pedido del cliente', () => {
  it('CA-TRK-08 con el motorizado en la puerta, el teléfono viaja en null', () => {
    const dto = toOrderDetailDto(
      row({ arrived_at_customer_at: '2026-11-16T15:30:00.000Z' }),
      'La Florencia',
      CARLOS,
      TRAVEL,
    )
    expect(dto.driver).toEqual({ name: 'Carlos Ramírez', phone: null })
    expect(JSON.stringify(dto)).not.toContain('987654321')
  })

  it('CA-TRK-08 antes de llegar tampoco hay teléfono', () => {
    const dto = toOrderDetailDto(row(), 'La Florencia', CARLOS, TRAVEL)
    expect(dto.driver?.phone).toBeNull()
  })

  it('CA-TRK-08 sin motorizado, driver es null', () => {
    expect(toOrderDetailDto(row(), 'La Florencia', null, TRAVEL).driver).toBeNull()
  })
})

describe('los plazos y el trayecto en el detalle del pedido', () => {
  it('CA-TRK-05 lleva la hora de entrada a aceptación y a validación', () => {
    const dto = toOrderDetailDto(
      row({ validating_at: '2026-11-16T15:00:30.000Z' }),
      'La Florencia',
      null,
      TRAVEL,
    )
    expect(dto.pendingAcceptanceAt).toBe('2026-11-16T15:01:00.000Z')
    expect(dto.validatingAt).toBe('2026-11-16T15:00:30.000Z')
  })

  it('CA-TRK-04 lleva el trayecto como rango, o null si no hay ajuste', () => {
    expect(toOrderDetailDto(row(), null, null, TRAVEL).travelMinutes).toEqual({ min: 20, max: 25 })
    expect(toOrderDetailDto(row(), null, null, null).travelMinutes).toBeNull()
  })

  it('CA-TRK-04 la respuesta cumple el contrato OpenAPI', () => {
    const dto = toOrderDetailDto(row(), 'La Florencia', null, TRAVEL)
    expect(CustomerOrderDetailSchema.safeParse(dto).success).toBe(true)
  })
})

describe('los instantes y el trayecto del detalle', () => {
  it('CA-TRK-05 los instantes con +00:00 salen en UTC con Z', () => {
    const dto = toOrderDetailDto(
      row({
        pending_acceptance_at: '2026-11-16T15:01:00.123456+00:00',
        validating_at: '2026-11-16T10:00:30-05:00',
      }),
      null,
      null,
      null,
    )
    expect(dto.pendingAcceptanceAt).toBe('2026-11-16T15:01:00.123Z')
    expect(dto.validatingAt).toBe('2026-11-16T15:00:30.000Z')
    expect(
      toOrderDetailDto(row({ pending_acceptance_at: null }), null, null, null).pendingAcceptanceAt,
    ).toBeNull()
  })
})
