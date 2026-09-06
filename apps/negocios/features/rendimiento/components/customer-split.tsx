'use client'

import { type PerformanceCustomers, stackedPair } from '@tindivo/core'
import { Card, Icon } from '@tindivo/ui'
import { CHART_ACCENT, CHART_SECOND } from '../lib/chart-tokens'

const TRACK = 300
const HEIGHT = 22

/**
 * Nuevos vs. los que ya habían pedido antes.
 *
 * «Ya había pedido» se mide contra el historial COMPLETO del negocio, no contra
 * el rango: la pregunta es si el cliente ya te conocía, no si pidió dos veces
 * esta semana. Dos identidades, así que lleva leyenda.
 */
export function CustomerSplit({ customers }: { customers: PerformanceCustomers }) {
  const { total, new: nuevos, returning: vuelven } = customers
  const { aWidth, bWidth, gap } = stackedPair(nuevos, vuelven, TRACK)
  const tasa = total > 0 ? (vuelven / total) * 100 : 0

  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name="group" size={18} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink">Clientes del periodo</h3>
          <p className="text-xs text-ink-muted">Cuántos te conocían ya</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-xs text-ink-muted">
          Sin clientes atendidos en este rango.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[26px] font-bold leading-none tracking-tight text-ink">
              {total}
            </span>
            <span className="text-xs text-ink-muted">
              {total === 1 ? 'persona atendida' : 'personas atendidas'}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${TRACK} ${HEIGHT}`}
            className="mt-3 w-full"
            role="img"
            aria-label={`${nuevos} clientes nuevos y ${vuelven} que ya habían pedido antes`}
          >
            <title>Reparto de clientes nuevos y recurrentes</title>
            {aWidth > 0 && (
              <rect x={0} y={0} width={aWidth} height={HEIGHT} rx={4} fill={CHART_ACCENT} />
            )}
            {bWidth > 0 && (
              <rect
                x={aWidth + gap}
                y={0}
                width={bWidth}
                height={HEIGHT}
                rx={4}
                fill={CHART_SECOND}
              />
            )}
          </svg>

          {/* Leyenda: con dos series nunca se depende solo del color */}
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <LegendRow color={CHART_ACCENT} label="Primera vez" value={nuevos} total={total} />
            <LegendRow
              color={CHART_SECOND}
              label="Ya habían pedido"
              value={vuelven}
              total={total}
            />
          </div>

          <div className="mt-3 rounded-lg bg-surface p-2.5 text-[11px] text-ink-muted">
            {tasa >= 25 ? (
              <>
                <strong className="text-ink">{tasa.toFixed(1)}%</strong> de los que te compraron ya
                te conocían. Esa base es la que aguanta las semanas flojas.
              </>
            ) : (
              <>
                Solo <strong className="text-ink">{tasa.toFixed(1)}%</strong> ya te había comprado.
                Traer gente nueva cuesta; que vuelva, no.
              </>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function LegendRow({
  color,
  label,
  value,
  total,
}: {
  color: string
  label: string
  value: number
  total: number
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center justify-between gap-2">
      {/* La identidad la da el punto de color, nunca el color del texto */}
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-bold tabular-nums text-ink">
        {value} <span className="font-normal text-ink-muted">({pct.toFixed(0)}%)</span>
      </span>
    </div>
  )
}
