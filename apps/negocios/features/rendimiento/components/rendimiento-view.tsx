'use client'

import { ApiError } from '@tindivo/api-client'
import { buildInsights, computeDelta } from '@tindivo/core'
import { Button, Card, Icon } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { api } from '@/lib/api'
import { type DatePreset, formatRangeLabel, getPresetRange } from '@/lib/order-history/date-utils'
import { usePerformance } from '../hooks/use-performance'
import { useReviews } from '../hooks/use-reviews'
import { BillCard } from './bill-card'
import { CustomerSplit } from './customer-split'
import { InsightsPanel } from './insights-panel'
import { ReviewsCard } from './reviews-card'
import { StatTile } from './stat-tile'
import { TrendChart } from './trend-chart'
import { WeekdayChart } from './weekday-chart'

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

/**
 * El rango por defecto es 7 DÍAS, no «hoy».
 *
 * Con «hoy» casi todo lo interesante era estructuralmente cero: la comparación
 * contra el periodo anterior comparaba una noche contra otra, y «clientes que
 * ya habían pedido» preguntaba en la práctica quién pidió dos veces la misma
 * noche (en producción: cero en 17 de 27 jornadas). Una semana es la unidad
 * mínima en la que este panel dice algo.
 */
const DEFAULT_PRESET = 'last_7_days' satisfies Exclude<DatePreset, 'custom'>

export function RendimientoView() {
  const [activePreset, setActivePreset] = useState<DatePreset>(DEFAULT_PRESET)
  const [{ start, end }, setRange] = useState(() => getPresetRange(DEFAULT_PRESET))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const { data, loading, error } = usePerformance(start, end)
  // Mismo rango que todo lo demás: el filtro de arriba manda también aquí.
  const resenas = useReviews(start, end)
  const rangeLabel = formatRangeLabel(start, end)

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data])

  function handleRangeChange(newStart: string, newEnd: string) {
    setRange({ start: newStart, end: newEnd })
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const params = new URLSearchParams({ start, end, label: rangeLabel })
      const blob = await api.getBlob(`/business/reports/rendimiento/pdf?${params.toString()}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rendimiento-${start}-al-${end}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo exportar el reporte',
      )
    } finally {
      setExporting(false)
    }
  }

  const revenueDelta = data ? computeDelta(data.current.revenue, data.previous.revenue) : undefined
  const ordersDelta = data
    ? computeDelta(data.current.delivered, data.previous.delivered)
    : undefined
  const ticketDelta = data ? computeDelta(data.current.ticket, data.previous.ticket) : undefined
  const netIncome = data ? Math.max(0, data.current.revenue - data.bill.commission) : 0

  return (
    <>
      {/* Un solo filtro arriba, que manda sobre todo lo de abajo */}
      <DateRangePicker
        startDate={start}
        endDate={end}
        onRangeChange={handleRangeChange}
        activePreset={activePreset}
        onPresetChange={setActivePreset}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          Comparado contra{' '}
          <strong className="text-ink">
            {data ? `${data.previous.start} al ${data.previous.end}` : 'el periodo anterior'}
          </strong>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || loading || !data}
          className="shrink-0 gap-1.5"
        >
          <Icon name="download" size={16} />
          {exporting ? 'Generando…' : 'Exportar PDF'}
        </Button>
      </div>

      {exportError && (
        <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{exportError}</div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>
      )}

      {/* Sin salto de layout al refrescar: se sostiene el render anterior */}
      <div
        className={`flex flex-col gap-3.5 pb-6 transition-opacity ${
          loading && data ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {loading && !data ? (
          <Skeleton />
        ) : data ? (
          <>
            {/* 1. Las tres cifras, cada una contra su periodo anterior */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="Facturación en comida"
                value={soles(data.current.revenue)}
                delta={revenueDelta}
                sub={`${data.current.delivered} ${data.current.delivered === 1 ? 'pedido' : 'pedidos'}`}
              />
              <StatTile
                label="Ticket promedio"
                value={soles(data.current.ticket)}
                delta={ticketDelta}
                sub="Por pedido entregado"
              />
              <StatTile
                label="Tu ingreso neto"
                value={soles(netIncome)}
                tone="positive"
                sub="Comida menos la comisión"
              />
            </div>

            {/* 2. La tendencia: la forma del periodo */}
            <Card className="p-4 sm:p-5">
              <TrendChart daily={data.daily} />
            </Card>

            {/* 3. Qué hacer con todo esto */}
            <InsightsPanel insights={insights} />

            {/* 4. El patrón semanal y la factura real */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <Card className="p-4 sm:p-5">
                <WeekdayChart weekday={data.weekday} weeks={data.weekdayWindow.weeks} />
              </Card>
              <BillCard bill={data.bill} />
            </div>

            {/* 5. Clientes y volumen — y qué opinaron.
                La reseña va con los clientes y no con las cifras de arriba a
                propósito: no es una métrica de venta, es lo que dijo la gente
                que ya te compró. */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <ReviewsCard data={resenas.data} loading={resenas.loading} />
              <CustomerSplit customers={data.customers} />
              <Card className="flex flex-col p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
                    <Icon name="two_wheeler" size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Movimiento del periodo</h3>
                    <p className="text-xs text-ink-muted">Lo que pasó por tu cocina</p>
                  </div>
                </div>
                <ul className="mt-4 flex flex-col gap-2 text-xs">
                  <Row label="Pedidos entregados" value={String(data.current.delivered)} />
                  <Row
                    label="Pedidos cancelados"
                    value={String(data.current.cancelled)}
                    danger={data.current.cancelled > 0}
                  />
                  <Row
                    label="Envíos pagados por tus clientes"
                    value={soles(data.current.deliveryFees)}
                  />
                  <Row
                    label="Total que pagaron tus clientes"
                    value={soles(data.current.revenue + data.current.deliveryFees)}
                    strong
                  />
                </ul>
                {ordersDelta?.comparable && ordersDelta.pct !== null && (
                  <p className="mt-3 rounded-lg bg-surface p-2.5 text-[11px] text-ink-muted">
                    {ordersDelta.direction === 'down' ? 'Bajaste' : 'Subiste'} de{' '}
                    <strong className="text-ink">{data.previous.delivered}</strong> a{' '}
                    <strong className="text-ink">{data.current.delivered}</strong> pedidos frente al
                    periodo anterior.
                  </p>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

function Row({
  label,
  value,
  strong,
  danger,
}: {
  label: string
  value: string
  strong?: boolean
  danger?: boolean
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 ${
        strong ? 'border-t border-ink/[0.06] pt-2' : ''
      }`}
    >
      <span className="text-ink-muted">{label}</span>
      <span
        className={`font-mono font-bold tabular-nums ${danger ? 'text-danger' : 'text-ink'} ${
          strong ? 'text-sm' : ''
        }`}
      >
        {value}
      </span>
    </li>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface" />
    </div>
  )
}
