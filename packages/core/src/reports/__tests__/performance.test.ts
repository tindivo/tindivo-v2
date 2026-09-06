import { describe, expect, it } from 'vitest'
import {
  bestWeekdayByTicket,
  buildInsights,
  computeDelta,
  type PerformancePayload,
  type PerformanceWeekdayPoint,
  weakestWeekday,
} from '../performance'

function weekday(partial: Partial<Record<number, Partial<PerformanceWeekdayPoint>>> = {}) {
  return Array.from({ length: 7 }, (_, dow) => ({
    dow,
    orders: 0,
    revenue: 0,
    ticket: 0,
    ...(partial[dow] ?? {}),
  }))
}

function payload(over: Partial<PerformancePayload> = {}): PerformancePayload {
  return {
    period: { start: '2026-08-30', end: '2026-09-05', days: 7 },
    current: { revenue: 1000, delivered: 40, cancelled: 0, deliveryFees: 100, ticket: 25 },
    previous: { start: '2026-08-23', end: '2026-08-29', revenue: 1000, delivered: 40, ticket: 25 },
    bill: { commission: 60, deliveryFee: 100, refund: 0, total: 160 },
    customers: { total: 30, new: 20, returning: 10 },
    daily: [],
    weekday: weekday(),
    weekdayWindow: { start: '2026-07-12', end: '2026-09-05', weeks: 8 },
    ...over,
  }
}

describe('computeDelta', () => {
  it('computes percentage change against the previous period', () => {
    const d = computeDelta(8341.4, 7641)
    expect(d.pct).toBe(9.2)
    expect(d.direction).toBe('up')
    expect(d.comparable).toBe(true)
  })

  it('reports a drop as down', () => {
    const d = computeDelta(500, 1000)
    expect(d.pct).toBe(-50)
    expect(d.direction).toBe('down')
  })

  it('never invents a percentage when the previous period was zero', () => {
    const d = computeDelta(500, 0)
    expect(d.pct).toBeNull()
    expect(d.comparable).toBe(false)
    expect(d.abs).toBe(500)
  })

  it('treats a negligible change as flat', () => {
    expect(computeDelta(1000, 1000).direction).toBe('flat')
  })
})

describe('weekday helpers', () => {
  it('ignores weekdays with too small a sample', () => {
    // El domingo tiene el ticket más alto pero un solo pedido: es ruido.
    const w = weekday({
      0: { orders: 1, ticket: 99 },
      5: { orders: 20, ticket: 28 },
      6: { orders: 25, ticket: 34 },
    })
    expect(bestWeekdayByTicket(w)?.dow).toBe(6)
  })

  it('returns null when there are not enough distinct weekdays to compare', () => {
    expect(bestWeekdayByTicket(weekday({ 6: { orders: 25, ticket: 34 } }))).toBeNull()
    expect(weakestWeekday(weekday({ 6: { orders: 25, ticket: 34 } }))).toBeNull()
  })

  it('finds the weakest weekday by volume', () => {
    const w = weekday({
      2: { orders: 5, ticket: 27 },
      5: { orders: 20, ticket: 28 },
      6: { orders: 25, ticket: 34 },
    })
    expect(weakestWeekday(w)?.dow).toBe(2)
  })
})

describe('buildInsights', () => {
  it('stays silent rather than guessing when there is no history', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 0, delivered: 0, cancelled: 0, deliveryFees: 0, ticket: 0 },
        previous: { start: '', end: '', revenue: 0, delivered: 0, ticket: 0 },
        customers: { total: 0, new: 0, returning: 0 },
        weekday: weekday(),
      }),
    )
    expect(insights).toEqual([])
  })

  it('leads with the revenue trend when it moved materially', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 1200, delivered: 45, cancelled: 0, deliveryFees: 0, ticket: 26.7 },
        previous: { start: '', end: '', revenue: 1000, delivered: 40, ticket: 25 },
      }),
    )
    expect(insights[0]?.id).toBe('trend')
    expect(insights[0]?.tone).toBe('good')
    expect(insights[0]?.title).toContain('20%')
  })

  it('flags a drop as a warning', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 700, delivered: 28, cancelled: 0, deliveryFees: 0, ticket: 25 },
        previous: { start: '', end: '', revenue: 1000, delivered: 40, ticket: 25 },
      }),
    )
    const trend = insights.find((i) => i.id === 'trend')
    expect(trend?.tone).toBe('warn')
    expect(trend?.title).toContain('menos')
  })

  it('ignores trend noise below the 5% threshold', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 1020, delivered: 40, cancelled: 0, deliveryFees: 0, ticket: 25.5 },
        previous: { start: '', end: '', revenue: 1000, delivered: 40, ticket: 25 },
      }),
    )
    expect(insights.find((i) => i.id === 'trend')).toBeUndefined()
  })

  it('names the strong weekday by ticket with the real gap', () => {
    const insights = buildInsights(
      payload({
        weekday: weekday({
          1: { orders: 10, revenue: 217, ticket: 21.74 },
          5: { orders: 15, revenue: 415, ticket: 27.72 },
          6: { orders: 20, revenue: 674, ticket: 33.74 },
        }),
      }),
    )
    const best = insights.find((i) => i.id === 'best-weekday')
    expect(best?.title).toContain('sábado')
    // 33.74 vs 21.74 = +55.2%
    expect(best?.title).toContain('55.2%')
  })

  it('does not claim a weekday pattern on a thin sample', () => {
    const insights = buildInsights(
      payload({ weekday: weekday({ 6: { orders: 4, revenue: 100, ticket: 25 } }) }),
    )
    expect(insights.find((i) => i.id === 'best-weekday')).toBeUndefined()
    expect(insights.find((i) => i.id === 'weak-weekday')).toBeUndefined()
  })

  it('warns about weak retention and celebrates a strong one', () => {
    const flojo = buildInsights(payload({ customers: { total: 100, new: 85, returning: 15 } }))
    expect(flojo.find((i) => i.id === 'retention')?.tone).toBe('warn')

    const bueno = buildInsights(payload({ customers: { total: 100, new: 60, returning: 40 } }))
    expect(bueno.find((i) => i.id === 'retention')?.tone).toBe('good')
  })

  it('stays quiet on retention when the sample is too small to mean anything', () => {
    const insights = buildInsights(payload({ customers: { total: 5, new: 5, returning: 0 } }))
    expect(insights.find((i) => i.id === 'retention')).toBeUndefined()
  })

  it('surfaces cancellations only when they are a real share of the period', () => {
    const alto = buildInsights(
      payload({
        current: { revenue: 1000, delivered: 40, cancelled: 8, deliveryFees: 0, ticket: 25 },
      }),
    )
    expect(alto.find((i) => i.id === 'cancellations')).toBeDefined()

    const bajo = buildInsights(
      payload({
        current: { revenue: 1000, delivered: 40, cancelled: 1, deliveryFees: 0, ticket: 25 },
      }),
    )
    expect(bajo.find((i) => i.id === 'cancellations')).toBeUndefined()
  })

  it('never returns more than four insights', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 2000, delivered: 60, cancelled: 10, deliveryFees: 0, ticket: 33 },
        previous: { start: '', end: '', revenue: 1000, delivered: 40, ticket: 25 },
        customers: { total: 100, new: 90, returning: 10 },
        weekday: weekday({
          1: { orders: 10, revenue: 217, ticket: 21.74 },
          2: { orders: 5, revenue: 139, ticket: 27.82 },
          5: { orders: 15, revenue: 415, ticket: 27.72 },
          6: { orders: 20, revenue: 674, ticket: 33.74 },
        }),
      }),
    )
    expect(insights.length).toBeLessThanOrEqual(4)
  })
})
