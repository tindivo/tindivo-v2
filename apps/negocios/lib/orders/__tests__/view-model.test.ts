import { describe, expect, it } from 'vitest'
import { buildNegociosCardVM } from '../card-view-model'
import type { OrderRow } from '../view-model'
import { formatReadyDelta, toOrderVM } from '../view-model'

function mockOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord_123',
    short_id: '123',
    source: 'web',
    status: 'preparing',
    payment_intent: 'pending_cash',
    customer_name: 'Juan Perez',
    customer_phone: '999888777',
    delivery_reference: 'Calle San Martin 123',
    delivery_method: 'delivery',
    order_amount: 25.0,
    delivery_fee: 5.0,
    prep_time_minutes: 15,
    estimated_ready_at: null,
    ready_early_used: false,
    waiting_driver_at: null,
    picked_up_at: null,
    driver_id: null,
    driver: null,
    created_at: '2026-08-05T15:00:00Z',
    pending_acceptance_at: null,
    awaiting_payment_at: null,
    validating_at: null,
    pays_with_cash: null,
    cash_change: null,
    wallet_part: null,
    cash_part: null,
    requires_validation: false,
    validation_reason_code: null,
    risk_flags: {},
    prep_extension_count: 0,
    prep_extension_minutes: null,
    ready_early_at: null,
    proof_status: null,
    proof_url: null,
    proof_attempt: 0,
    delivered_at: null,
    cancelled_at: null,
    cancel_note: null,
    cancel_reason: null,
    ...overrides,
  }
}

describe('formatReadyDelta', () => {
  it('formatea deltas positivos sin signo y con padding mm:ss (ej. 04:30)', () => {
    expect(formatReadyDelta(270)).toBe('04:30')
    expect(formatReadyDelta(5)).toBe('00:05')
    expect(formatReadyDelta(0)).toBe('00:00')
  })

  it('formatea deltas negativos con signo menos y padding mm:ss (ej. -02:45, -00:05)', () => {
    expect(formatReadyDelta(-165)).toBe('-02:45')
    expect(formatReadyDelta(-5)).toBe('-00:05')
  })

  it('formatea deltas >= 60 minutos como Xh Ym (ej. 2h 05m, -2h 43m)', () => {
    expect(formatReadyDelta(7516)).toBe('2h 05m')
    expect(formatReadyDelta(-9814)).toBe('-2h 43m')
  })
})

describe('toOrderVM readySec calculation', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('1. estimated_ready_at en el futuro -> readySec positivo correcto', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: '2026-08-05T15:20:00Z', // +5 min (300 sec)
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBe(300)
    expect(formatReadyDelta(vm.readySec!)).toBe('05:00')
  })

  it('2. estimated_ready_at en el pasado, ready_early_used=false -> readySec negativo en cooking, heading, y waiting', () => {
    const pastReadyAt = '2026-08-05T15:12:15Z' // -2 min 45 sec (-165 sec)

    // Estado cooking (preparing)
    const vmCooking = toOrderVM(
      mockOrderRow({
        status: 'preparing',
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmCooking.state).toBe('cooking')
    expect(vmCooking.readySec).toBe(-165)
    expect(formatReadyDelta(vmCooking.readySec!)).toBe('-02:45')

    // Estado heading (heading_to_restaurant o waiting_driver con driver_id)
    const vmHeading = toOrderVM(
      mockOrderRow({
        status: 'heading_to_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmHeading.state).toBe('heading')
    expect(vmHeading.readySec).toBe(-165)

    // Estado waiting (waiting_at_restaurant)
    const vmWaiting = toOrderVM(
      mockOrderRow({
        status: 'waiting_at_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmWaiting.state).toBe('waiting')
    expect(vmWaiting.readySec).toBe(-165)
  })

  it('3. estimated_ready_at en el pasado, ready_early_used=true -> readySec negativo (-300s)', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: '2026-08-05T15:10:00Z',
      ready_early_used: true,
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBe(-300)
  })

  const readyAtPlus10 = '2026-08-05T15:25:00Z' // baseNow + 10 min

  it('4. readyEarly en `cooking`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'preparing',
        driver_id: null,
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('cooking')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })

  it('5. readyEarly en `heading`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'heading_to_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('heading')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })

  it('6. readyEarly en `waiting`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'waiting_at_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('waiting')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })
})

describe('buildNegociosCardVM', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('diferencia origen Manual vs Online en la insignia de origen', () => {
    const rowManual = mockOrderRow({ source: 'business_manual', status: 'pending_acceptance' })
    const vmManual = buildNegociosCardVM(toOrderVM(rowManual, baseNow))
    expect(vmManual.sourceBadge.label).toBe('Manual')
    expect(vmManual.sourceBadge.icon).toBe('call')

    const rowWeb = mockOrderRow({ source: 'customer_pwa', status: 'pending_acceptance' })
    const vmWeb = buildNegociosCardVM(toOrderVM(rowWeb, baseNow))
    expect(vmWeb.sourceBadge.label).toBe('Online')
    expect(vmWeb.sourceBadge.icon).toBe('language')
  })

  it('destaca el vuelto a entregar en efectivo', () => {
    const row = mockOrderRow({
      payment_intent: 'pending_cash',
      client_pays_with: 50.0,
      change_to_give: 20.0,
      order_amount: 25.0,
      delivery_fee: 5.0,
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow))
    expect(cardVm.money.cashChangeText).toBe('Vuelto a entregar: S/ 20')
  })

  it('asigna la acción 1-tap "Motorizado llegó · Entregar" cuando el motorizado está en la puerta', () => {
    const row = mockOrderRow({
      status: 'waiting_at_restaurant',
      driver_id: 'drv_1',
      driver: { full_name: 'Carlos Chofer' },
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow))
    expect(cardVm.primaryAction?.type).toBe('deliver')
    expect(cardVm.primaryAction?.label).toContain('Carlos Chofer llegó · Entregar')
  })

  it('asigna la acción 1-tap "Pedir motorizado YA" en buffer_p3', () => {
    const row = mockOrderRow({
      status: 'waiting_driver',
      waiting_driver_at: '2026-08-05T15:00:00Z', // 15 min esperando moto
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow), { supportPhone: '999111222' })
    expect(cardVm.primaryAction?.type).toBe('callDriver')
    expect(cardVm.primaryAction?.label).toBe('Pedir motorizado YA')
  })
})


