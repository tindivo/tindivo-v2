'use client'

import {
  bandBars,
  bestWeekdayByTicket,
  type ChartBox,
  niceMax,
  type PerformanceWeekdayPoint,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_SHORT,
} from '@tindivo/core'
import { useState } from 'react'
import { CHART_ACCENT, CHART_GRID, CHART_MUTED } from '../lib/chart-tokens'

const BOX: ChartBox = {
  width: 420,
  height: 150,
  padTop: 18,
  padBottom: 24,
  padLeft: 4,
  padRight: 4,
}

type Metric = 'ticket' | 'orders'

/**
 * Patrón por día de la semana. Forma de ÉNFASIS, no categórica: los siete días
 * son la misma serie, así que el día fuerte va en el acento y el resto en gris
 * de contexto. Pintar siete colores aquí gastaría el canal de identidad en
 * recodificar lo que la altura de la barra ya dice.
 */
export function WeekdayChart({
  weekday,
  weeks,
}: {
  weekday: PerformanceWeekdayPoint[]
  weeks: number
}) {
  const [metric, setMetric] = useState<Metric>('ticket')
  const [hover, setHover] = useState<number | null>(null)

  const ordered = WEEKDAY_DISPLAY_ORDER.map(
    (dow) => weekday.find((w) => w.dow === dow) ?? { dow, orders: 0, revenue: 0, ticket: 0 },
  )
  const totalOrders = weekday.reduce((s, w) => s + w.orders, 0)

  if (totalOrders === 0) {
    return (
      <div>
        <Header weeks={weeks} metric={metric} onMetric={setMetric} showToggle={false} />
        <p className="py-8 text-center text-xs text-ink-muted">
          Todavía no hay pedidos entregados en las últimas {weeks} semanas.
        </p>
      </div>
    )
  }

  // Los dos extremos se miden SIEMPRE sobre la métrica que se está pintando.
  // Antes el mínimo salía de `weakestWeekday` (que mide volumen) aunque el
  // gráfico mostrara ticket: con los datos reales eso etiquetaba el martes
  // —cuyo ticket es del montón— y dejaba sin marcar el lunes, que es el ticket
  // más bajo de verdad. Una etiqueta señalando el extremo equivocado es peor
  // que no poner ninguna.
  const best = metric === 'ticket' ? bestWeekdayByTicket(weekday) : bestWeekdayByVolume(weekday)
  const worst = weakestByMetric(weekday, metric)

  const values = ordered.map((w) => (metric === 'ticket' ? w.ticket : w.orders))
  const max = niceMax(Math.max(...values))
  const bars = bandBars(values, max, BOX, 0.5, 22)
  const baseline = BOX.height - BOX.padBottom

  const fmt = (v: number) => (metric === 'ticket' ? `S/ ${v.toFixed(0)}` : String(v))

  return (
    <div>
      <Header weeks={weeks} metric={metric} onMetric={setMetric} showToggle />

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="w-full"
        role="img"
        aria-label={
          metric === 'ticket'
            ? 'Ticket promedio por día de la semana'
            : 'Pedidos por día de la semana'
        }
      >
        <title>
          {metric === 'ticket'
            ? 'Ticket promedio por día de la semana'
            : 'Pedidos por día de la semana'}
        </title>

        <line
          x1={BOX.padLeft}
          y1={baseline}
          x2={BOX.width - BOX.padRight}
          y2={baseline}
          stroke={CHART_GRID}
          strokeWidth={1}
        />

        {bars.map((bar, i) => {
          const day = ordered[i]
          if (!day) return null
          const esFuerte = best?.dow === day.dow
          const esFlojo = worst?.dow === day.dow
          const activo = hover === i
          // Etiqueta solo en los extremos (y en el que se está mirando): un
          // número sobre cada barra se vuelve ruido y nadie lo lee.
          const etiquetado = esFuerte || esFlojo || activo
          return (
            // Hover de ratón y nada más: el día fuerte y el flojo ya van
            // etiquetados en el propio gráfico, y el pie repite el hallazgo. Sin
            // ratón no se pierde ningún valor, así que no lleva rol ni foco.
            // biome-ignore lint/a11y/noStaticElementInteractions: hover decorativo; los extremos van directamente etiquetados
            <g key={day.dow} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Zona de impacto de banda completa, no solo la barra */}
              <rect
                x={bar.x - 8}
                y={0}
                width={bar.width + 16}
                height={BOX.height}
                fill="transparent"
              />
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={Math.max(bar.height, day.orders > 0 ? 2 : 0)}
                rx={4}
                fill={esFuerte ? CHART_ACCENT : CHART_MUTED}
                opacity={activo && !esFuerte ? 0.75 : 1}
              />
              {etiquetado && (
                <text
                  x={bar.x + bar.width / 2}
                  y={bar.y - 5}
                  textAnchor="middle"
                  className={esFuerte ? 'fill-ink font-bold' : 'fill-ink-muted'}
                  fontSize={10}
                >
                  {fmt(values[i] ?? 0)}
                </text>
              )}
              <text
                x={bar.x + bar.width / 2}
                y={BOX.height - 8}
                textAnchor="middle"
                className={esFuerte ? 'fill-ink font-semibold' : 'fill-ink-subtle'}
                fontSize={10}
              >
                {WEEKDAY_SHORT[day.dow]}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="mt-1 text-center text-[11px] text-ink-muted">
        {best ? (
          <>
            Tu día fuerte es el <strong className="text-ink">{WEEKDAY_SHORT[best.dow]}</strong>
            {metric === 'ticket'
              ? ` · S/ ${best.ticket.toFixed(2)} por pedido`
              : ` · ${best.orders} pedidos`}
          </>
        ) : (
          `Aún no hay muestra suficiente por día para marcar un patrón.`
        )}
      </p>
    </div>
  )
}

function bestWeekdayByVolume(weekday: PerformanceWeekdayPoint[]): PerformanceWeekdayPoint | null {
  const usable = weekday.filter((w) => w.orders >= 3)
  if (usable.length < 2) return null
  return usable.reduce((b, w) => (w.orders > b.orders ? w : b))
}

/** El día más bajo según lo que el gráfico esté mostrando ahora mismo. */
function weakestByMetric(
  weekday: PerformanceWeekdayPoint[],
  metric: Metric,
): PerformanceWeekdayPoint | null {
  const usable = weekday.filter((w) => w.orders >= 3)
  if (usable.length < 3) return null
  const val = (w: PerformanceWeekdayPoint) => (metric === 'ticket' ? w.ticket : w.orders)
  return usable.reduce((worst, w) => (val(w) < val(worst) ? w : worst))
}

function Header({
  weeks,
  metric,
  onMetric,
  showToggle,
}: {
  weeks: number
  metric: Metric
  onMetric: (m: Metric) => void
  showToggle: boolean
}) {
  return (
    <div className="mb-1 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-ink">Tu semana típica</h3>
        {/* El plazo va rotulado porque NO es el filtro de arriba: un patrón
            semanal sobre 7 días tendría una muestra por día, o sea nada. */}
        <p className="text-xs text-ink-muted">Últimas {weeks} semanas, no el rango elegido</p>
      </div>
      {showToggle && (
        <div className="flex shrink-0 rounded-lg bg-surface p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => onMetric('ticket')}
            className={`rounded-md px-2 py-1 transition-colors ${
              metric === 'ticket' ? 'bg-card text-ink shadow-elev-1' : 'text-ink-muted'
            }`}
          >
            Ticket
          </button>
          <button
            type="button"
            onClick={() => onMetric('orders')}
            className={`rounded-md px-2 py-1 transition-colors ${
              metric === 'orders' ? 'bg-card text-ink shadow-elev-1' : 'text-ink-muted'
            }`}
          >
            Pedidos
          </button>
        </div>
      )}
    </div>
  )
}
