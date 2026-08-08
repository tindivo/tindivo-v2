import { describe, expect, it } from 'vitest'
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

  it('3. estimated_ready_at en el pasado, ready_early_used=true -> readySec null', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: '2026-08-05T15:10:00Z',
      ready_early_used: true,
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBeNull()
  })

  // ── "Marcar listo" con la comida aún por delante ───────────────────────────
  // Escenario de la regla (a) de `advance_order('ready')`: si faltaban MÁS de
  // `queue_lead_minutes()` (10), el LEAST adelanta `estimated_ready_at` a
  // ahora+10min — o sea que SIGUE EN EL FUTURO aunque la comida ya esté lista.
  // Ese desfase es justo el que hacía que la tarjeta contara minutos de cocción
  // de un pedido que ya salió. Estos tres casos fijan qué recibe cada tarjeta.
  const readyAtPlus10 = '2026-08-05T15:25:00Z' // baseNow + 10 min

  it('4. readyEarly en `cooking`: readySec null pero minutesLeft SIGUE contando', () => {
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
    expect(vm.readySec).toBeNull()
    // `minutesLeft` NO mira `ready_early_used` en la rama de 'cooking'. Sin la
    // guarda de `readyEarly` en la tarjeta, esto se pinta como "Cocinando · 10m
    // restantes" para comida que ya está lista.
    expect(vm.minutesLeft).toBe(10)
  })

  it('5. readyEarly en `heading`: readySec y minutesLeft ambos null', () => {
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
    expect(vm.readySec).toBeNull()
    // Aquí sí interviene `stillCooking`, que incluye `!ready_early_used`.
    expect(vm.minutesLeft).toBeNull()
  })

  it('6. readyEarly en `waiting`: readySec y minutesLeft ambos null', () => {
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
    expect(vm.readySec).toBeNull()
    expect(vm.minutesLeft).toBeNull()
  })

  it('4. estimated_ready_at null -> readySec null', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: null,
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBeNull()
  })

  it('5. Caso límite: readyAtMs === now -> readySec === 0 (no negativo)', () => {
    const exactNowStr = '2026-08-05T15:15:00Z'
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: exactNowStr,
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBe(0)
    expect(formatReadyDelta(vm.readySec!)).toBe('00:00')
  })
})
