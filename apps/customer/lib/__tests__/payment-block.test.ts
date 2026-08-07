import { describe, expect, it } from 'vitest'
import type { AppealData, CancelledOrder } from '../payment-block'
import { checkPaymentBlock, isOrderBlocking } from '../payment-block'

function makeOrder(overrides: Partial<CancelledOrder> = {}): CancelledOrder {
  return {
    id: 'order-1',
    short_id: 'ABC123',
    cancelled_at: new Date().toISOString(),
    ...overrides,
  }
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

const NOW = new Date()

describe('isOrderBlocking', () => {
  // ── Dentro de ventana de 24h ───────────────────────────────────────

  it('bloquea: dentro de ventana, sin apelación', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(isOrderBlocking(order, null, NOW)).toBe(true)
  })

  it('bloquea: dentro de ventana, apelación pending', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(isOrderBlocking(order, { appeal_status: 'pending', refund_status: null }, NOW)).toBe(
      true,
    )
  })

  it('bloquea: dentro de ventana, apelación in_review', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(isOrderBlocking(order, { appeal_status: 'in_review', refund_status: null }, NOW)).toBe(
      true,
    )
  })

  it('bloquea: aprobada pero devolución pending', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(
      isOrderBlocking(order, { appeal_status: 'approved', refund_status: 'pending' }, NOW),
    ).toBe(true)
  })

  it('NO bloquea: aprobada con devolución completed', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(
      isOrderBlocking(order, { appeal_status: 'approved', refund_status: 'completed' }, NOW),
    ).toBe(false)
  })

  it('NO bloquea: rechazada (favor_restaurante)', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(2) })
    expect(isOrderBlocking(order, { appeal_status: 'rejected', refund_status: null }, NOW)).toBe(
      false,
    )
  })

  // ── Fuera de ventana de 24h ────────────────────────────────────────

  it('NO bloquea: fuera de ventana, sin apelación', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(25) })
    expect(isOrderBlocking(order, null, NOW)).toBe(false)
  })

  it('bloquea: fuera de ventana pero apelación aún pending', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(25) })
    expect(isOrderBlocking(order, { appeal_status: 'pending', refund_status: null }, NOW)).toBe(
      true,
    )
  })

  it('bloquea: fuera de ventana pero apelación in_review', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(30) })
    expect(isOrderBlocking(order, { appeal_status: 'in_review', refund_status: null }, NOW)).toBe(
      true,
    )
  })

  it('bloquea: fuera de ventana, aprobada pero refund pending', () => {
    const order = makeOrder({ cancelled_at: hoursAgo(48) })
    expect(
      isOrderBlocking(order, { appeal_status: 'approved', refund_status: 'pending' }, NOW),
    ).toBe(true)
  })

  // ── Edge cases ─────────────────────────────────────────────────────

  it('NO bloquea: cancelled_at es null', () => {
    const order = makeOrder({ cancelled_at: null })
    expect(isOrderBlocking(order, null, NOW)).toBe(false)
  })

  it('NO bloquea: exactamente al borde de 24h (deadline expirado)', () => {
    const now = new Date()
    const cancelledAt = new Date(now.getTime() - 24 * 3600_000)
    const order = makeOrder({ cancelled_at: cancelledAt.toISOString() })
    expect(isOrderBlocking(order, null, now)).toBe(false)
  })
})

describe('checkPaymentBlock', () => {
  it('no bloquea si no hay pedidos cancelados', () => {
    const result = checkPaymentBlock([], () => null, NOW)
    expect(result.blocked).toBe(false)
    expect(result.blockedOrderShortId).toBeNull()
  })

  it('bloquea por el primer pedido bloqueante y retorna su short_id', () => {
    const orders = [
      makeOrder({ id: 'o1', short_id: 'AAA', cancelled_at: hoursAgo(2) }),
      makeOrder({ id: 'o2', short_id: 'BBB', cancelled_at: hoursAgo(1) }),
    ]
    const result = checkPaymentBlock(orders, () => null, NOW)
    expect(result.blocked).toBe(true)
    expect(result.blockedOrderShortId).toBe('AAA')
  })

  it('bloquea si al menos un pedido de varios está sin resolver', () => {
    const orders = [
      makeOrder({ id: 'o1', short_id: 'AAA', cancelled_at: hoursAgo(2) }),
      makeOrder({ id: 'o2', short_id: 'BBB', cancelled_at: hoursAgo(1) }),
    ]
    const appeals: Record<string, AppealData> = {
      o1: { appeal_status: 'rejected', refund_status: null },
      // o2 no tiene apelación → bloquea
    }
    const result = checkPaymentBlock(orders, (id) => appeals[id] ?? null, NOW)
    expect(result.blocked).toBe(true)
    expect(result.blockedOrderShortId).toBe('BBB')
  })

  it('NO bloquea si todos los pedidos están resueltos', () => {
    const orders = [
      makeOrder({ id: 'o1', short_id: 'AAA', cancelled_at: hoursAgo(2) }),
      makeOrder({ id: 'o2', short_id: 'BBB', cancelled_at: hoursAgo(1) }),
    ]
    const appeals: Record<string, AppealData> = {
      o1: { appeal_status: 'rejected', refund_status: null },
      o2: { appeal_status: 'approved', refund_status: 'completed' },
    }
    const result = checkPaymentBlock(orders, (id) => appeals[id] ?? null, NOW)
    expect(result.blocked).toBe(false)
  })
})
