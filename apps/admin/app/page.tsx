'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertsBell,
  BarMini,
  DataTable,
  DonutMini,
  EmptyState,
  Hero,
  Ico,
  KpiCard,
  RangeTabs,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '@/components/admin'
import { SalesChart } from '@/components/admin/sales-chart'
import { api, errMsg } from '@/lib/api'
import { num, soles } from '@/lib/format'
import { ACTIVE_STATUSES, CANCEL_LABEL, ORDER_STATUS } from '@/lib/labels'
import type { Metrics, OrderRow } from '@/lib/types'

const RANGE_LABEL: Record<string, string> = {
  today: 'hoy',
  '7d': 'últimos 7 días',
  '30d': 'últimos 30 días',
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  )
}

function ActiveOrderCard({ o }: { o: OrderRow }) {
  const s = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const }
  return (
    <div className="rounded-[16px] border border-ink/5 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] text-ink">#{o.short_id}</span>
        <StatusBadge label={s.label} tone={s.tone} />
      </div>
      <p className="mt-1 truncate text-[14px] text-ink">{o.customer_name ?? 'Cliente'}</p>
      <p className="mt-0.5 font-mono text-[12px] text-ink-subtle tabular-nums">
        {soles(o.order_amount)}
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-[28px] bg-ink/[0.05]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
          <div key={i} className="h-20 animate-pulse rounded-[22px] bg-ink/[0.05]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[28px] bg-ink/[0.05]" />
    </div>
  )
}

export default function DashboardPage() {
  const [range, setRange] = useState('today')
  const [m, setM] = useState<Metrics | null>(null)
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setM(null)
    api
      .get<ApiEnvelope<Metrics>>(`/admin/metrics?range=${range}`)
      .then((r) => setM(r.data))
      .catch((e) => setError(errMsg(e)))
    api
      .get<ApiEnvelope<OrderRow[]>>('/admin/orders')
      .then((r) => setOrders(r.data.filter((o) => ACTIVE_STATUSES.has(o.status))))
      .catch(() => setOrders([]))
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeader
        eyebrow="Tindivo · Sala de control"
        title="Dashboard"
        right={
          <>
            <button
              type="button"
              onClick={load}
              className="grid h-9 w-9 place-items-center rounded-xl bg-ink/[0.06] text-ink transition-colors hover:bg-ink/[0.1]"
              aria-label="Refrescar"
            >
              <Ico.refresh className="h-5 w-5" />
            </button>
            <div className="hidden lg:block">
              <AlertsBell />
            </div>
          </>
        }
      />

      <RangeTabs value={range} onChange={setRange} />

      {error && <p className="text-[14px] text-danger">{error}</p>}

      {!m ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Hero financiero */}
          <Hero
            variant="orange"
            eyebrow={`Resumen · ${RANGE_LABEL[range] ?? range}`}
            right={
              <Link
                href="/metricas"
                className="rounded-xl bg-white/15 px-3 py-2 font-medium text-[13px] text-white backdrop-blur transition-colors hover:bg-white/25"
              >
                Ver métricas →
              </Link>
            }
          >
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="t-eyebrow !text-white/70">GMV del rango</p>
                <p className="t-display text-[40px] leading-none tabular-nums">
                  {soles(m.kpis.gmv)}
                </p>
              </div>
              <div>
                <p className="t-eyebrow !text-white/70">Comisión Tindivo</p>
                <p className="t-display text-[24px] leading-none tabular-nums">
                  {soles(m.kpis.commission)}
                </p>
              </div>
              <div>
                <p className="t-eyebrow !text-white/70">Ticket promedio</p>
                <p className="t-display text-[24px] leading-none tabular-nums">
                  {soles(m.kpis.avgTicket)}
                </p>
              </div>
              <div>
                <p className="t-eyebrow !text-white/70">Pedidos</p>
                <p className="t-display text-[24px] leading-none tabular-nums">
                  {num(m.kpis.orders)}
                </p>
              </div>
            </div>
          </Hero>

          {/* KPIs */}
          <section>
            <p className="t-eyebrow mb-2">Indicadores del rango</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Pedidos"
                value={num(m.kpis.orders)}
                sub={`${m.kpis.delivered} entreg · ${m.kpis.inProgress} en curso`}
              />
              <KpiCard
                label="Cancelados"
                value={num(m.kpis.cancelled)}
                sub={`${m.kpis.cancelledPct}% del total`}
                tone={m.kpis.cancelledPct >= 20 ? 'danger' : 'default'}
              />
              <KpiCard label="GMV" value={soles(m.kpis.gmv)} tone="brand" />
              <KpiCard label="Comisión" value={soles(m.kpis.commission)} tone="success" />
              <KpiCard label="Ticket prom." value={soles(m.kpis.avgTicket)} />
              <KpiCard label="Tiempo prom." value={`${m.kpis.avgMinutes} min`} />
              <KpiCard
                label="A tiempo"
                value={`${m.kpis.onTimePct}%`}
                tone={m.kpis.onTimePct < 80 ? 'warning' : 'success'}
              />
              <KpiCard label="Efectivo" value={soles(m.kpis.cash)} />
            </div>
          </section>

          {/* Monitor en vivo */}
          <section>
            <p className="t-eyebrow mb-2">Monitor en vivo</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Por aceptar"
                value={num(m.monitor.pendingAcceptance)}
                pulse={m.monitor.pendingAcceptance > 0}
              />
              <StatCard
                label="Esperando moto"
                value={num(m.monitor.waitingDriver)}
                pulse={m.monitor.waitingDriver > 0}
              />
              <StatCard
                label="Moto al local"
                value={num(m.monitor.headingToRestaurant)}
                pulse={m.monitor.headingToRestaurant > 0}
              />
              <StatCard
                label="En entrega"
                value={num(m.monitor.pickedUp)}
                pulse={m.monitor.pickedUp > 0}
              />
            </div>
          </section>

          {/* Evolución + cumplimiento */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="t-card lg:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="t-display text-[15px] text-ink">Evolución de ventas</p>
                <div className="flex items-center gap-3 text-[12px] text-ink-muted">
                  <Legend dot="#F97316" label="GMV" />
                  <Legend dot="#C2410C" label="Comisión" />
                </div>
              </div>
              {(m.series ?? []).length === 0 ? (
                <EmptyState title="Sin datos en el rango" />
              ) : (
                <SalesChart data={m.series ?? []} />
              )}
            </div>
            <div className="t-card flex flex-col gap-5">
              <div>
                <p className="t-display text-[15px] text-ink">Cumplimiento</p>
                <div className="mt-3">
                  <DonutMini
                    pct={m.kpis.onTimePct}
                    label="Pedidos a tiempo"
                    sublabel={`${m.kpis.delivered} entregados`}
                  />
                </div>
              </div>
              {m.byCancelReason.length > 0 && (
                <div>
                  <p className="t-eyebrow mb-2">Razones de cancelación</p>
                  <BarMini
                    items={m.byCancelReason.map((c) => ({
                      label: CANCEL_LABEL[c.reason] ?? c.reason,
                      value: c.count,
                    }))}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Por negocio / por motorizado */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="t-card">
              <p className="t-display mb-3 text-[15px] text-ink">Por negocio</p>
              <DataTable
                rows={m.byBusiness}
                getRowKey={(b, i) => `${b.name}-${i}`}
                empty={<EmptyState title="Sin datos en el rango" />}
                columns={[
                  { key: 'name', header: 'Negocio', render: (b) => b.name },
                  {
                    key: 'total',
                    header: 'Ped.',
                    align: 'right',
                    mono: true,
                    render: (b) => b.total,
                  },
                  {
                    key: 'delivered',
                    header: 'Entreg.',
                    align: 'right',
                    mono: true,
                    render: (b) => b.delivered,
                  },
                  {
                    key: 'gmv',
                    header: 'GMV',
                    align: 'right',
                    mono: true,
                    render: (b) => soles(b.gmv),
                  },
                  {
                    key: 'commission',
                    header: 'Comisión',
                    align: 'right',
                    mono: true,
                    render: (b) => soles(b.commission),
                  },
                ]}
              />
            </div>
            <div className="t-card">
              <p className="t-display mb-3 text-[15px] text-ink">Por motorizado</p>
              <DataTable
                rows={m.byDriver}
                getRowKey={(d, i) => `${d.name}-${i}`}
                empty={<EmptyState title="Sin datos en el rango" />}
                columns={[
                  { key: 'name', header: 'Motorizado', render: (d) => d.name },
                  {
                    key: 'deliveries',
                    header: 'Entregas',
                    align: 'right',
                    mono: true,
                    render: (d) => d.deliveries,
                  },
                  {
                    key: 'inProgress',
                    header: 'En curso',
                    align: 'right',
                    mono: true,
                    render: (d) => d.inProgress,
                  },
                  {
                    key: 'gmv',
                    header: 'GMV',
                    align: 'right',
                    mono: true,
                    render: (d) => soles(d.gmv),
                  },
                ]}
              />
            </div>
          </section>

          {/* Pedidos activos */}
          <section className="t-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="t-display text-[15px] text-ink">Pedidos activos</p>
              <Link href="/orders" className="font-medium text-[13px] text-brand-dark">
                Ver todos →
              </Link>
            </div>
            {!orders ? (
              <div className="h-24 animate-pulse rounded-2xl bg-ink/[0.04]" />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<Ico.clock className="h-5 w-5" />}
                title="Nada en curso ahora mismo"
                hint="Los pedidos activos aparecerán aquí."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {orders.slice(0, 6).map((o) => (
                  <ActiveOrderCard key={o.id} o={o} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
