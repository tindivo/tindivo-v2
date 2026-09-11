'use client'

import { ApiError } from '@tindivo/api-client'
import {
  buildBoost,
  buildGoal,
  buildInsights,
  buildMood,
  computeDelta,
  computePerNightDelta,
  fmtOrders,
  perNight,
  plural,
  soles,
} from '@tindivo/core'
import { Button, Card, Icon } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useSupportPhone } from '@/features/pedidos/hooks/use-support-phone'
import { api } from '@/lib/api'
import { type DatePreset, formatRangeLabel, getPresetRange } from '@/lib/order-history/date-utils'
import { usePerformance } from '../hooks/use-performance'
import { BillCard } from './bill-card'
import { BoostCard } from './boost-card'
import { CustomerSplit } from './customer-split'
import { GoalCard } from './goal-card'
import { InsightsPanel } from './insights-panel'
import { MoodBanner } from './mood-banner'
import { StatTile } from './stat-tile'
import { TonightCard } from './tonight-card'
import { TrendChart } from './trend-chart'
import { WeekdayChart } from './weekday-chart'

/**
 * El rango por defecto son 7 DÍAS y termina AYER.
 *
 * Siete y no «hoy» porque con una sola jornada casi todo lo interesante era
 * estructuralmente cero: la comparación enfrentaba una noche contra otra, y
 * «clientes que ya habían pedido» preguntaba en la práctica quién pidió dos
 * veces la misma noche (en producción: cero en 17 de 27 jornadas).
 *
 * Y termina AYER porque los locales abren de noche: a media tarde la jornada en
 * curso está vacía por definición, así que incluirla comparaba seis noches
 * vividas contra siete completas. Ese −1/7 no dice nada del negocio — en prod
 * (2026-09-07) el local más grande había SUBIDO un 11% por noche y el panel le
 * pintaba una flecha roja de −3.3%. La noche en curso no se pierde: la enseña
 * `TonightCard`, aparte y sin porcentajes.
 */
const DEFAULT_PRESET = 'last_7_days' satisfies Exclude<DatePreset, 'custom'>
const RANGE_OPTIONS = { excludeToday: true } as const

export function RendimientoView() {
  const [activePreset, setActivePreset] = useState<DatePreset>(DEFAULT_PRESET)
  const [{ start, end }, setRange] = useState(() => getPresetRange(DEFAULT_PRESET, RANGE_OPTIONS))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const { data, loading, error } = usePerformance(start, end)
  const supportPhone = useSupportPhone()
  const rangeLabel = formatRangeLabel(start, end)

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data])
  const mood = useMemo(() => (data ? buildMood(data) : null), [data])
  const goal = useMemo(() => (data ? buildGoal(data) : null), [data])
  const boost = useMemo(() => (data ? buildBoost(data, data.businessName) : null), [data])

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

  /*
   * Las variaciones van POR NOCHE TRABAJADA, no sobre el total del periodo.
   *
   * Dos ventanas del mismo largo casi nunca han trabajado las mismas noches —
   * una fiesta, un corte de luz, un domingo que se cerró— y comparar sus totales
   * puede invertir el signo de la realidad. La cifra grande sigue siendo el
   * total, que es lo que el dueño quiere saber; el badge lleva su rótulo «por
   * noche» para que no se lean como lo mismo.
   *
   * El ingreso neto es la excepción: no lleva variación porque su periodo
   * anterior no viaja en el payload, y calcularlo a medias sería peor que no
   * enseñarlo.
   */
  const revenueDelta = data
    ? computePerNightDelta(
        data.current.revenue,
        data.current.nights,
        data.previous.revenue,
        data.previous.nights,
      )
    : undefined
  const ordersDelta = data
    ? computePerNightDelta(
        data.current.delivered,
        data.current.nights,
        data.previous.delivered,
        data.previous.nights,
      )
    : undefined
  // El ticket ya es una media por pedido: dividirlo otra vez entre noches no
  // significaría nada. Se compara tal cual.
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
        rangeOptions={RANGE_OPTIONS}
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
            {/* 0. Cómo le fue, en una frase y con una cara. Va primero a
                propósito: fija el tono con el que se lee todo lo demás. */}
            {mood && <MoodBanner mood={mood} />}
            <TonightCard tonight={data.tonight} />

            {/* 1. Las tres cifras, cada una contra su periodo anterior */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="Facturación en comida"
                value={soles(data.current.revenue)}
                delta={revenueDelta}
                deltaLabel="por noche"
                sub={`${soles(perNight(data.current.revenue, data.current.nights))} en ${data.current.nights} ${plural(data.current.nights, 'noche', 'noches')}`}
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

            {/* 2. La meta: hacia dónde, no solo de dónde viene */}
            {goal && (
              <GoalCard
                goal={goal}
                town={data.town}
                days={data.period.days}
                ordersPerNight={perNight(data.current.delivered, data.current.nights)}
                nights={data.current.nights}
              />
            )}

            {/* 3. La tendencia: la forma del periodo */}
            <Card className="p-4 sm:p-5">
              <TrendChart daily={data.daily} />
            </Card>

            {/* 4. Qué hacer con todo esto */}
            <InsightsPanel insights={insights} />

            {/* 5. Y si vino floja, la mano que Tindivo tiende. Va DESPUÉS del
                diagnóstico: primero se entiende qué pasó, después se ofrece
                ayuda. Al revés parece publicidad. */}
            {boost && <BoostCard boost={boost} supportPhone={supportPhone} />}

            {/* 6. El patrón semanal y la factura real */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <Card className="p-4 sm:p-5">
                <WeekdayChart weekday={data.weekday} weeks={data.weekdayWindow.weeks} />
              </Card>
              <BillCard bill={data.bill} />
            </div>

            {/* 7. Clientes y volumen */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
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
                  <Row
                    label="Noches trabajadas"
                    value={`${data.current.nights} de ${data.period.days}`}
                  />
                  <Row label="Pedidos entregados" value={String(data.current.delivered)} />
                  <Row
                    label="Pedidos por noche"
                    value={fmtOrders(perNight(data.current.delivered, data.current.nights))}
                  />
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
                    <strong className="text-ink">
                      {fmtOrders(perNight(data.previous.delivered, data.previous.nights))}
                    </strong>{' '}
                    a{' '}
                    <strong className="text-ink">
                      {fmtOrders(perNight(data.current.delivered, data.current.nights))}
                    </strong>{' '}
                    pedidos por noche frente al periodo anterior.
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
      <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-surface" />
      <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface" />
    </div>
  )
}
