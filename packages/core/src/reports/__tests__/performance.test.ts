import { describe, expect, it } from 'vitest'
import {
  bestWeekdayByTicket,
  buildBoost,
  buildGoal,
  buildInsights,
  buildMood,
  computeDelta,
  computePerNightDelta,
  type PerformanceCurrent,
  type PerformancePayload,
  type PerformancePrevious,
  type PerformanceWeekdayPoint,
  perNight,
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

/**
 * `current` y `previous` se mezclan por campos, no se reemplazan enteros.
 *
 * Antes cada caso escribía el objeto completo, así que al añadir `nights` en la
 * 0222 habría habido que tocar los quince. Y peor: cada test tendría que
 * declarar un número de noches que no le importa, y una errata ahí cambiaría en
 * silencio el resultado de la métrica que sí está probando.
 *
 * El fixture trabaja 7 de 7 noches a propósito. Con `nights === days` la media
 * por noche es proporcional al total, así que los casos que solo miran
 * porcentajes siguen midiendo lo que medían. Quien quiera probar el efecto de
 * las noches lo dice explícitamente.
 */
type PayloadOverride = Partial<Omit<PerformancePayload, 'current' | 'previous'>> & {
  current?: Partial<PerformanceCurrent>
  previous?: Partial<PerformancePrevious>
}

function payload(over: PayloadOverride = {}): PerformancePayload {
  const base: PerformancePayload = {
    period: { start: '2026-08-30', end: '2026-09-05', days: 7 },
    current: {
      revenue: 1000,
      delivered: 40,
      cancelled: 0,
      deliveryFees: 100,
      ticket: 25,
      nights: 7,
    },
    previous: {
      start: '2026-08-23',
      end: '2026-08-29',
      revenue: 1000,
      delivered: 40,
      ticket: 25,
      nights: 7,
    },
    bill: { commission: 60, deliveryFee: 100, refund: 0, total: 160 },
    customers: { total: 30, new: 20, returning: 10 },
    daily: [],
    weekday: weekday(),
    weekdayWindow: { start: '2026-07-12', end: '2026-09-05', weeks: 8 },
    tonight: { date: '2026-09-06', orders: 0, revenue: 0, active: 0, inRange: false },
    record: {
      window: { start: '2026-08-16', end: '2026-08-22', orders: 50, revenue: 1250, days: 7 },
      night: { date: '2026-08-22', orders: 12, revenue: 300 },
    },
    town: { businesses: 4, ordersPerNight: 4, revenuePerNight: 110, ticket: 26 },
  }
  return {
    ...base,
    ...over,
    current: { ...base.current, ...over.current },
    previous: { ...base.previous, ...over.previous },
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
  /**
   * Este caso cambió de intención en la 0222 y merece decirse.
   *
   * Antes se exigía silencio ABSOLUTO sin historial, y eso era correcto contra
   * el consejo genérico. Pero llevado al extremo dejaba al local que no vendió
   * nada mirando una pantalla vacía, que es justo cuando más falta hace decirle
   * algo. Ahora habla, con una sola frase, y esa frase es un hecho de su cuenta
   * («no entregaste ningún pedido en 7 días») más dónde mirar — no un consejo
   * de manual que valdría para cualquier restaurante del país.
   */
  it('speaks to the zero-orders case instead of leaving the panel blank', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 0, delivered: 0, cancelled: 0, deliveryFees: 0, ticket: 0, nights: 0 },
        previous: { start: '', end: '', revenue: 0, delivered: 0, ticket: 0, nights: 0 },
        customers: { total: 0, new: 0, returning: 0 },
        weekday: weekday(),
        record: { window: null, night: null },
      }),
    )
    expect(insights).toHaveLength(1)
    expect(insights[0]?.id).toBe('nights')
    expect(insights[0]?.title).toContain('ningún pedido')
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

// ── Lo que trajo la 0222 ─────────────────────────────────────────────────────

describe('per-night normalisation', () => {
  /**
   * El caso real que motivó todo el cambio, con las cifras de prod del
   * 2026-09-07. El local más grande de San Jacinto hizo 73 pedidos en 6 noches
   * contra 77 en 7: por noche SUBIÓ, y el panel le pintaba una caída porque el
   * rango incluía la jornada en curso, todavía vacía.
   */
  it('reads a busier week as up even when the raw total is down', () => {
    const total = computeDelta(1842.5, 1904.5)
    expect(total.direction).toBe('down')

    const porNoche = computePerNightDelta(1842.5, 6, 1904.5, 7)
    expect(porNoche.direction).toBe('up')
    expect(porNoche.pct).toBe(12.9)
  })

  it('does not divide by zero when no night was worked', () => {
    expect(perNight(500, 0)).toBe(0)
    expect(computePerNightDelta(0, 0, 700, 7).comparable).toBe(true)
  })

  it('keeps quiet about a trend built on a handful of orders', () => {
    // 2 pedidos en 2 noches contra 5 en 4: un tercer pedido movería la cifra un
    // 50%. Decir «bajaste 36.6%» ahí es ruido, y además contradecía al titular,
    // que le dice que su venta por noche está bien.
    const insights = buildInsights(
      payload({
        current: {
          revenue: 49.8,
          delivered: 2,
          cancelled: 2,
          deliveryFees: 2,
          ticket: 24.9,
          nights: 2,
        },
        previous: { revenue: 157.1, delivered: 5, ticket: 31.42, nights: 4 },
        customers: { total: 2, new: 1, returning: 1 },
        record: {
          window: { start: '2026-08-24', end: '2026-08-30', orders: 5, revenue: 157.1, days: 7 },
          night: null,
        },
      }),
    )
    expect(insights.find((i) => i.id === 'trend')).toBeUndefined()
    expect(insights.find((i) => i.id === 'nights')).toBeDefined()
  })
})

describe('buildGoal', () => {
  it('targets the business own past best', () => {
    const goal = buildGoal(payload({ current: { delivered: 25 } }))
    expect(goal.target).toBe(50)
    expect(goal.missing).toBe(25)
    expect(goal.progress).toBe(0.5)
    expect(goal.state).toBe('behind')
  })

  // El 60% es el corte entre «hay margen» y «en camino», y de él depende qué
  // carita ve el dueño. Se fija aquí para que no se mueva sin querer.
  it('puts the on-track line exactly at 60% of the record', () => {
    expect(buildGoal(payload({ current: { delivered: 30 } })).state).toBe('onTrack')
    expect(buildGoal(payload({ current: { delivered: 29 } })).state).toBe('behind')
  })

  it('calls it a record only when the past mark is actually beaten', () => {
    expect(buildGoal(payload({ current: { delivered: 51 } })).state).toBe('record')
    expect(buildGoal(payload({ current: { delivered: 50 } })).state).toBe('tied')
    expect(buildGoal(payload({ current: { delivered: 49 } })).state).toBe('close')
  })

  /**
   * Con cifras grandes el progreso redondeado a dos decimales puede dar 1
   * exacto sin que la marca esté igualada. Se comparan enteros justo para que
   * eso no anuncie un récord falso.
   */
  it('never announces a record off a rounded progress', () => {
    const goal = buildGoal(
      payload({
        current: { delivered: 999 },
        record: {
          window: { start: 'a', end: 'b', orders: 1000, revenue: 0, days: 7 },
          night: null,
        },
      }),
    )
    expect(goal.progress).toBe(1)
    expect(goal.state).not.toBe('record')
    expect(goal.missing).toBe(1)
  })

  it('has no target for a business without a full past window', () => {
    const goal = buildGoal(payload({ record: { window: null, night: null } }))
    expect(goal.state).toBe('noBaseline')
    expect(goal.target).toBe(0)
  })
})

describe('buildMood', () => {
  it('blames the closed nights before the sales, because that is the cause', () => {
    const mood = buildMood(
      payload({
        current: { revenue: 49.8, delivered: 2, ticket: 24.9, nights: 2 },
        previous: { revenue: 157.1, delivered: 5, ticket: 31.42, nights: 4 },
      }),
    )
    expect(mood.level).toBe('soft')
    expect(mood.headline).toContain('2 de 7 noches')
    expect(mood.offerHelp).toBe(true)
  })

  it('accompanies the business that sold nothing instead of scoring it', () => {
    const mood = buildMood(payload({ current: { revenue: 0, delivered: 0, ticket: 0, nights: 0 } }))
    expect(mood.level).toBe('worried')
    expect(mood.offerHelp).toBe(true)
    // El titular constata, no acusa: nada de porcentajes en la cara.
    expect(mood.headline).not.toContain('%')
  })

  it('celebrates a beaten record above everything else', () => {
    const mood = buildMood(payload({ current: { delivered: 60, revenue: 1500 } }))
    expect(mood.level).toBe('celebrating')
    expect(mood.offerHelp).toBe(false)
  })

  it('says the sample is thin rather than calling it steady', () => {
    const mood = buildMood(
      payload({
        current: { revenue: 90, delivered: 4, ticket: 22.5, nights: 7 },
        previous: { revenue: 70, delivered: 3, ticket: 23.3, nights: 7 },
        record: { window: null, night: null },
      }),
    )
    expect(mood.level).toBe('steady')
    expect(mood.headline).toContain('pocos pedidos')
  })
})

describe('buildBoost', () => {
  const flojo = () => payload({ current: { revenue: 49.8, delivered: 2, ticket: 24.9, nights: 2 } })

  it('offers help only when the mood asks for it', () => {
    // Batiendo su récord: la oferta sería publicidad de fondo.
    expect(buildBoost(payload({ current: { delivered: 60 } }), 'La Florencia')).toBeNull()

    const boost = buildBoost(flojo(), 'Al Punto')
    expect(boost).not.toBeNull()
    expect(boost?.bullets.length).toBeGreaterThan(0)
  })

  it('puts the numbers in the WhatsApp message so the reply can be useful', () => {
    const boost = buildBoost(flojo(), 'Al Punto')
    expect(boost?.whatsappMessage).toContain('Al Punto')
    expect(boost?.whatsappMessage).toContain('2 pedidos')
    expect(boost?.whatsappMessage).toContain('2026-09-05')
  })

  /**
   * Los bullets no pueden prometer un botón: hoy no hay tabla de promociones ni
   * forma de destacar un local en el catálogo (`/public/businesses` ordena por
   * nombre). Todo lo que ofrece la tarjeta lo hace una persona por WhatsApp, y
   * este test es el que avisa si alguien escribe ahí un «desde el panel…».
   */
  it('never sends the owner to a screen that does not exist', () => {
    const boost = buildBoost(flojo(), 'Al Punto')
    for (const b of boost?.bullets ?? []) {
      expect(b.toLowerCase()).not.toMatch(/desde el panel|en la secci|bot[oó]n/)
    }
  })

  it('leads with the nights when the nights are the problem', () => {
    expect(buildBoost(flojo(), 'Al Punto')?.bullets[0]).toContain('abrir')
  })
})

describe('town comparison', () => {
  it('stays quiet when there are too few businesses to anonymise', () => {
    const insights = buildInsights(
      payload({
        current: { revenue: 200, delivered: 8, ticket: 25, nights: 7 },
        previous: { revenue: 210, delivered: 8, ticket: 26, nights: 7 },
        town: { businesses: 2, ordersPerNight: 4, revenuePerNight: 110, ticket: 26 },
      }),
    )
    expect(insights.find((i) => i.id === 'town')).toBeUndefined()
  })

  it('only mentions the town when the business is below it', () => {
    const debajo = buildInsights(
      payload({
        current: { revenue: 200, delivered: 8, ticket: 25, nights: 7 },
        previous: { revenue: 210, delivered: 8, ticket: 26, nights: 7 },
      }),
    )
    expect(debajo.find((i) => i.id === 'town')).toBeDefined()

    const encima = buildInsights(
      payload({
        current: { revenue: 1000, delivered: 40, ticket: 25, nights: 7 },
        previous: { revenue: 1000, delivered: 40, ticket: 25, nights: 7 },
      }),
    )
    expect(encima.find((i) => i.id === 'town')).toBeUndefined()
  })
})
