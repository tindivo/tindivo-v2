import { describe, expect, it } from 'vitest'
import { canRelease, minePhase, prematureMinutes } from '../phase'

describe('minePhase', () => {
  it('reparte los cuatro pasos por estado y llegada a la puerta', () => {
    expect(minePhase({ status: 'heading_to_restaurant' })).toBe('heading')
    expect(minePhase({ status: 'waiting_at_restaurant' })).toBe('waiting')
    expect(minePhase({ status: 'picked_up', arrived_at_customer_at: null })).toBe('carrying')
    expect(minePhase({ status: 'picked_up' })).toBe('carrying')
    expect(minePhase({ status: 'picked_up', arrived_at_customer_at: '2026-09-19T01:00:00Z' })).toBe(
      'atdoor',
    )
  })

  it('un pedido que no está en la mochila no tiene paso', () => {
    expect(minePhase({ status: 'waiting_driver' })).toBeNull()
    expect(minePhase({ status: 'delivered' })).toBeNull()
  })
})

describe('canRelease', () => {
  it('se suelta hasta que se recoge, no después (advance_order lo rechaza)', () => {
    expect(canRelease('heading')).toBe(true)
    expect(canRelease('waiting')).toBe(true)
    expect(canRelease('carrying')).toBe(false)
    expect(canRelease('atdoor')).toBe(false)
  })
})

describe('prematureMinutes', () => {
  const now = Date.parse('2026-09-19T01:00:00Z')

  it('faltan minutos y la cocina no marcó listo: es prematuro', () => {
    expect(
      prematureMinutes(
        { estimated_ready_at: '2026-09-19T01:04:00Z', ready_early_used: false },
        now,
      ),
    ).toBe(4)
  })

  it('si la cocina marcó listo, no se pregunta aunque el reloj aún corra', () => {
    // «Listo» recorta `estimated_ready_at` a unos minutos por delante, no a cero.
    expect(
      prematureMinutes({ estimated_ready_at: '2026-09-19T01:04:00Z', ready_early_used: true }, now),
    ).toBe(0)
  })

  it('con la hora ya pasada o sin hora no hay nada que avisar', () => {
    expect(
      prematureMinutes(
        { estimated_ready_at: '2026-09-19T00:58:00Z', ready_early_used: false },
        now,
      ),
    ).toBe(0)
    expect(prematureMinutes({ estimated_ready_at: null, ready_early_used: null }, now)).toBe(0)
  })

  it('redondea hacia arriba a un minuto como mínimo', () => {
    expect(
      prematureMinutes(
        { estimated_ready_at: '2026-09-19T01:00:20Z', ready_early_used: false },
        now,
      ),
    ).toBe(1)
  })
})
