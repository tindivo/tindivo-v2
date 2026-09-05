'use client'

import {
  areaPath,
  axisTicks,
  type ChartBox,
  linePath,
  niceMax,
  type PerformanceDailyPoint,
  projectSeries,
} from '@tindivo/core'
import { useId, useState } from 'react'
import { CHART_ACCENT, CHART_GRID, CHART_SURFACE } from '../lib/chart-tokens'

// `padTop` deja sitio a la etiqueta del tope del eje, que se dibuja por encima
// de su propia línea de rejilla y si no queda pegada al borde del recuadro.
const BOX: ChartBox = {
  width: 640,
  height: 190,
  padTop: 20,
  padBottom: 26,
  padLeft: 8,
  padRight: 8,
}

function dayLabel(iso: string): string {
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

function soles0(n: number): string {
  return `S/ ${Math.round(n).toLocaleString('es-PE')}`
}

/**
 * Facturación por jornada. Serie única, así que no lleva caja de leyenda: el
 * título ya dice qué se está pintando.
 */
export function TrendChart({ daily }: { daily: PerformanceDailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const clipId = useId()

  // Con menos de tres jornadas una línea no describe una tendencia, describe
  // dos puntos. Se muestra la tabla directamente en vez de fingir un gráfico.
  if (daily.length < 3) {
    return <TrendTable daily={daily} />
  }

  const values = daily.map((d) => d.revenue)
  const max = niceMax(Math.max(...values))
  const points = projectSeries(values, max, BOX)
  const ticks = axisTicks(max, 2)
  const plotBottom = BOX.height - BOX.padBottom
  const plotH = BOX.height - BOX.padTop - BOX.padBottom

  const peakIdx = values.indexOf(Math.max(...values))
  const active = hover ?? peakIdx
  const activePoint = points[active]
  const activeDay = daily[active]

  // Etiquetas del eje X: primera, última y la del pico. Más se solapan.
  const xLabelIdx = new Set([0, daily.length - 1, peakIdx])

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Facturación por día</h3>
          <p className="text-xs text-ink-muted">Solo comida, sin el envío</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          {showTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {showTable ? (
        <TrendTable daily={daily} />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            className="w-full"
            style={{ height: 'auto' }}
            role="img"
            aria-label={`Facturación por día entre el ${dayLabel(daily[0]?.date ?? '')} y el ${dayLabel(daily[daily.length - 1]?.date ?? '')}`}
          >
            <title>Facturación por día</title>
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={BOX.width} height={plotBottom} />
              </clipPath>
            </defs>

            {/* Rejilla: hairline sólida, un paso por encima de la superficie */}
            {ticks.map((t) => {
              const y = BOX.padTop + plotH - (t / max) * plotH
              return (
                <g key={t}>
                  <line
                    x1={BOX.padLeft}
                    y1={y}
                    x2={BOX.width - BOX.padRight}
                    y2={y}
                    stroke={CHART_GRID}
                    strokeWidth={1}
                  />
                  <text x={BOX.padLeft} y={y - 4} className="fill-ink-subtle" fontSize={10}>
                    {t === 0 ? '0' : soles0(t)}
                  </text>
                </g>
              )
            })}

            <g clipPath={`url(#${clipId})`}>
              <path d={areaPath(points, BOX)} fill={CHART_ACCENT} fillOpacity={0.1} />
              <path
                d={linePath(points)}
                fill="none"
                stroke={CHART_ACCENT}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>

            {/* Marcador activo: anillo de 2px en color de superficie */}
            {activePoint && (
              <>
                <line
                  x1={activePoint.x}
                  y1={BOX.padTop}
                  x2={activePoint.x}
                  y2={plotBottom}
                  stroke={CHART_GRID}
                  strokeWidth={1}
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={5}
                  fill={CHART_ACCENT}
                  stroke={CHART_SURFACE}
                  strokeWidth={2}
                />
              </>
            )}

            {/* Etiquetas del eje X, solo en los puntos que no chocan */}
            {points.map((p, i) =>
              xLabelIdx.has(i) ? (
                <text
                  key={daily[i]?.date}
                  x={p.x}
                  y={BOX.height - 8}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  className="fill-ink-subtle"
                  fontSize={10}
                >
                  {dayLabel(daily[i]?.date ?? '')}
                </text>
              ) : null,
            )}

            {/* Zonas de impacto anchas: el objetivo no es el punto de 5px.
                Son un realce de ratón, no la única vía al dato: cada valor está
                además en «Ver tabla», en el pie y en la etiqueta del pico. Por
                eso no llevan rol ni foco — no hay nada que se pierda sin ratón. */}
            {points.map((p, i) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: hover decorativo; los valores viven en la tabla y en las etiquetas
              <rect
                key={daily[i]?.date}
                x={p.x - (BOX.width - BOX.padLeft - BOX.padRight) / (points.length * 2)}
                y={0}
                width={(BOX.width - BOX.padLeft - BOX.padRight) / points.length}
                height={plotBottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>

          {activeDay && (
            <p className="mt-1 text-center text-xs text-ink-muted">
              <strong className="font-mono font-bold text-ink">
                {dayLabel(activeDay.date)} · S/ {activeDay.revenue.toFixed(2)}
              </strong>{' '}
              · {activeDay.orders} {activeDay.orders === 1 ? 'pedido' : 'pedidos'}
              {hover === null && ' (tu mejor jornada del rango)'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TrendTable({ daily }: { daily: PerformanceDailyPoint[] }) {
  if (daily.length === 0) {
    return <p className="py-6 text-center text-xs text-ink-muted">Sin jornadas en este rango.</p>
  }
  return (
    <div className="max-h-56 overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-ink/[0.06] text-ink-muted">
            <th className="py-1.5 font-semibold">Jornada</th>
            <th className="py-1.5 text-right font-semibold">Pedidos</th>
            <th className="py-1.5 text-right font-semibold">Facturación</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {daily.map((d) => (
            <tr key={d.date} className="border-b border-ink/[0.03] last:border-0">
              <td className="py-1.5 text-ink">{dayLabel(d.date)}</td>
              <td className="py-1.5 text-right text-ink-muted">{d.orders}</td>
              <td className="py-1.5 text-right font-semibold text-ink">
                S/ {d.revenue.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
