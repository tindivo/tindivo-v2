/**
 * Lectura del panel «Rendimiento»: tipos del payload que devuelve
 * `business_performance_metrics` y la interpretación que se deriva de él.
 *
 * Vive en `core` y no en la app porque el panel y el PDF tienen que decir
 * EXACTAMENTE lo mismo. Si cada uno derivara sus propias conclusiones, el día
 * que una cambie el negocio leerá dos diagnósticos distintos del mismo mes.
 *
 * Todo aquí es puro: entra el payload, sale texto y números. Sin I/O.
 */

export interface PerformancePeriod {
  start: string
  end: string
  days: number
}

export interface PerformanceCurrent {
  revenue: number
  delivered: number
  cancelled: number
  deliveryFees: number
  ticket: number
}

export interface PerformancePrevious {
  start: string
  end: string
  revenue: number
  delivered: number
  ticket: number
}

/** Lo que el periodo le generó de deuda al negocio, leído de `business_charges`. */
export interface PerformanceBill {
  commission: number
  deliveryFee: number
  refund: number
  total: number
}

export interface PerformanceCustomers {
  total: number
  new: number
  returning: number
}

export interface PerformanceDailyPoint {
  date: string
  orders: number
  revenue: number
}

export interface PerformanceWeekdayPoint {
  /** 0 = domingo … 6 = sábado (igual que `extract(dow)`). */
  dow: number
  orders: number
  revenue: number
  ticket: number
}

export interface PerformancePayload {
  period: PerformancePeriod
  current: PerformanceCurrent
  previous: PerformancePrevious
  bill: PerformanceBill
  customers: PerformanceCustomers
  daily: PerformanceDailyPoint[]
  weekday: PerformanceWeekdayPoint[]
  weekdayWindow: { start: string; end: string; weeks: number }
}

export const WEEKDAY_LABELS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const

/**
 * Plural para frases del tipo «los sábados».
 *
 * En castellano los días de lunes a viernes son invariables («los lunes»), pero
 * sábado y domingo sí pluralizan. Usar la forma singular para todos daba «los
 * sábado», que es lo primero que salta al leer el panel.
 */
export const WEEKDAY_PLURAL = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
] as const

/** Orden de presentación: la semana peruana empieza el lunes, no el domingo. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

// ── Comparación contra el periodo anterior ───────────────────────────────────

export interface Delta {
  /** Diferencia absoluta (actual − anterior). */
  abs: number
  /** Variación porcentual, o `null` si la base era 0 (no existe el porcentaje). */
  pct: number | null
  direction: 'up' | 'down' | 'flat'
  /** `false` cuando el periodo anterior no tuvo actividad: no hay con qué comparar. */
  comparable: boolean
}

export function computeDelta(current: number, previous: number): Delta {
  const abs = round2(current - previous)
  // Base 0: la variación porcentual no existe (dividir entre cero). Se marca
  // como no comparable para que la UI muestre «sin periodo previo» en vez de
  // un «+∞%» o un «+100%» inventado.
  if (previous === 0) {
    return { abs, pct: null, direction: current > 0 ? 'up' : 'flat', comparable: false }
  }
  const pct = round1(((current - previous) / previous) * 100)
  return {
    abs,
    pct,
    direction: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat',
    comparable: true,
  }
}

// ── Diagnóstico y recomendaciones ────────────────────────────────────────────

export type InsightTone = 'good' | 'warn' | 'info'

export interface Insight {
  id: string
  tone: InsightTone
  /** Titular corto: el hallazgo. */
  title: string
  /** Qué hacer con él. */
  action: string
}

/**
 * Muestras mínimas antes de afirmar nada. Un negocio con 4 pedidos no tiene
 * «patrón semanal»: tiene cuatro pedidos. Recomendar sobre ruido es peor que
 * callarse, porque el negocio actúa sobre ello.
 */
const MIN_ORDERS_FOR_WEEKDAY = 20
const MIN_ORDERS_PER_WEEKDAY = 3
const MIN_CUSTOMERS_FOR_RETENTION = 15

/** Días de la semana con muestra suficiente para compararse entre sí. */
function usableWeekdays(weekday: PerformanceWeekdayPoint[]): PerformanceWeekdayPoint[] {
  return weekday.filter((w) => w.orders >= MIN_ORDERS_PER_WEEKDAY)
}

export function bestWeekdayByTicket(
  weekday: PerformanceWeekdayPoint[],
): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 2) return null
  return usable.reduce((best, w) => (w.ticket > best.ticket ? w : best))
}

export function bestWeekdayByVolume(
  weekday: PerformanceWeekdayPoint[],
): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 2) return null
  return usable.reduce((best, w) => (w.orders > best.orders ? w : best))
}

export function weakestWeekday(weekday: PerformanceWeekdayPoint[]): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 3) return null
  return usable.reduce((worst, w) => (w.orders < worst.orders ? w : worst))
}

/**
 * Convierte el payload en 2-4 frases accionables, ordenadas por lo que más
 * mueve la aguja. Devuelve lista vacía si no hay datos que sostengan ninguna:
 * el panel muestra entonces «aún no hay suficiente historial», que es la
 * verdad, en vez de un consejo genérico que valdría para cualquier local.
 */
export function buildInsights(payload: PerformancePayload): Insight[] {
  const out: Insight[] = []
  const { current, previous, customers, weekday } = payload
  const totalWeekdayOrders = weekday.reduce((s, w) => s + w.orders, 0)

  // 1. La tendencia manda: es lo primero que quiere saber el dueño.
  const revDelta = computeDelta(current.revenue, previous.revenue)
  if (revDelta.comparable && revDelta.pct !== null && Math.abs(revDelta.pct) >= 5) {
    const subio = revDelta.direction === 'up'
    out.push({
      id: 'trend',
      tone: subio ? 'good' : 'warn',
      title: subio
        ? `Facturaste ${fmtPct(revDelta.pct)} más que el periodo anterior`
        : `Facturaste ${fmtPct(Math.abs(revDelta.pct))} menos que el periodo anterior`,
      action: subio
        ? `Pasaste de ${soles(previous.revenue)} a ${soles(current.revenue)}. Mira qué cambió y sostenlo.`
        : `Bajaste de ${soles(previous.revenue)} a ${soles(current.revenue)}. Revisa si fue menos pedidos (${previous.delivered} → ${current.delivered}) o ticket más bajo.`,
    })
  }

  // 2. El día fuerte, por ticket: es la palanca más directa sobre la caja.
  if (totalWeekdayOrders >= MIN_ORDERS_FOR_WEEKDAY) {
    const mejorTicket = bestWeekdayByTicket(weekday)
    const flojo = weakestWeekday(weekday)

    if (mejorTicket && flojo && mejorTicket.dow !== flojo.dow) {
      const usable = usableWeekdays(weekday)
      const peorTicket = usable.reduce((w, x) => (x.ticket < w.ticket ? x : w))
      const brecha =
        peorTicket.ticket > 0
          ? round1(((mejorTicket.ticket - peorTicket.ticket) / peorTicket.ticket) * 100)
          : 0

      if (brecha >= 15) {
        out.push({
          id: 'best-weekday',
          tone: 'info',
          title: `Los ${WEEKDAY_PLURAL[mejorTicket.dow]} tu ticket es ${fmtPct(brecha)} más alto`,
          action: `${soles(mejorTicket.ticket)} por pedido frente a ${soles(peorTicket.ticket)} los ${WEEKDAY_PLURAL[peorTicket.dow]}. Es el día para combos y platos grandes.`,
        })
      }

      if (flojo.orders > 0 && mejorTicket.orders >= flojo.orders * 1.5) {
        out.push({
          id: 'weak-weekday',
          tone: 'warn',
          title: `Los ${WEEKDAY_PLURAL[flojo.dow]} son tu día flojo`,
          action: `${flojo.orders} pedidos en 8 semanas, contra ${bestWeekdayByVolume(weekday)?.orders ?? 0} de tu mejor día. Una promo puntual ahí no te compite con tu propio fin de semana.`,
        })
      }
    }
  }

  // 3. Retención: barata de mover y la que sostiene el negocio a la larga.
  if (customers.total >= MIN_CUSTOMERS_FOR_RETENTION) {
    const tasa = round1((customers.returning / customers.total) * 100)
    if (tasa < 25) {
      out.push({
        id: 'retention',
        tone: 'warn',
        title: `Solo ${tasa}% de tus clientes del periodo ya había pedido antes`,
        action: `${customers.new} de ${customers.total} son primera vez. Traer gente nueva cuesta; que vuelvan, no. Un detalle en la bolsa del primer pedido es lo más barato que puedes probar.`,
      })
    } else {
      out.push({
        id: 'retention',
        tone: 'good',
        title: `${tasa}% de tus clientes del periodo ya te había comprado`,
        action: `${customers.returning} de ${customers.total} volvieron. Esa base es la que aguanta las semanas flojas.`,
      })
    }
  }

  // 4. Cancelaciones: solo si pesan de verdad sobre el periodo.
  const totalCerrados = current.delivered + current.cancelled
  if (totalCerrados >= 10 && current.cancelled > 0) {
    const tasa = round1((current.cancelled / totalCerrados) * 100)
    if (tasa >= 10) {
      out.push({
        id: 'cancellations',
        tone: 'warn',
        title: `${tasa}% de tus pedidos del periodo se cancelaron`,
        action: `${current.cancelled} de ${totalCerrados}. Si fue por fraude, puedes reclamar cobertura desde Historial.`,
      })
    }
  }

  return out.slice(0, 4)
}

// ── Formato ──────────────────────────────────────────────────────────────────

export function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

/** Sin decimales cuando es redondo: «9%» lee mejor que «9.0%». */
export function fmtPct(n: number): string {
  const abs = Math.abs(n)
  return `${Number.isInteger(abs) ? abs : abs.toFixed(1)}%`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
