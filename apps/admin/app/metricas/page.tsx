'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Segmented } from '@tindivo/ui'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DonutMini, EmptyState, KpiCard, RangeTabs, SectionHeader } from '@/components/admin'
import { SalesChart } from '@/components/admin/sales-chart'
import { api, errMsg } from '@/lib/api'
import { num, sharePcts, soles } from '@/lib/format'
import { CANCEL_LABEL, PAYMENT_REAL_LABEL } from '@/lib/labels'
import type { Metrics, PromoStats } from '@/lib/types'

type SubTab = 'ventas' | 'negocios' | 'motorizados' | 'cancelaciones'

const SUBTABS: { value: SubTab; label: string }[] = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'negocios', label: 'Negocios' },
  { value: 'motorizados', label: 'Motorizados' },
  { value: 'cancelaciones', label: 'Cancelaciones' },
]

const PIE = ['#F97316', '#FB923C', '#C2410C', '#FDBA74', '#9A3412', '#FED7AA']

const tooltipStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid #eae7e2',
  background: 'rgba(250,246,241,0.97)',
  fontSize: 13,
  boxShadow: '0 8px 24px rgb(26 22 20 / 0.1)',
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">{title}</p>
      {children}
    </div>
  )
}

function dayLabel(b: string) {
  return b.includes('T') ? `${b.slice(11, 13)}h` : `${b.slice(8, 10)}/${b.slice(5, 7)}`
}

/**
 * Consumo de la promo de envío gratis (0187).
 *
 * NO se esconde cuando la promo está apagada o agotada: el dato más útil de una
 * promo terminada es cuánto costó y a quién trajo. Solo desaparece si no hay
 * ninguna promo montada (`configured: false`), que es el estado de siempre fuera
 * de una campaña.
 *
 * Y no depende del `range` de la página a propósito: la promo es su propia
 * ventana de cuatro noches, así que recortarla por rango enseñaría un trozo de
 * algo que se decide entero. Por eso lleva sus fechas escritas en el subtítulo.
 */
function PromoCard({ stats }: { stats: PromoStats | null }) {
  if (!stats?.configured) return null

  const max = stats.maxRedemptions ?? 0
  const usados = stats.comprometidos ?? 0
  const restantes = stats.cuposRestantes ?? 0
  const pct = max > 0 ? Math.min(100, Math.round((usados / max) * 100)) : 0
  const agotada = restantes <= 0

  return (
    <div className="t-card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-display text-[15px] text-ink">Promo de envío gratis</p>
        <span className="text-[11px] text-ink-subtle">
          {stats.from} → {stats.to} ·{' '}
          {stats.activa ? (
            <span className="font-medium text-success">activa</span>
          ) : (
            <span className="font-medium text-ink-muted">apagada</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Cupos restantes"
          value={num(restantes)}
          tone={agotada ? 'danger' : 'brand'}
          sub={`de ${num(max)}`}
        />
        <KpiCard
          label="Redimidos"
          value={num(stats.redimidos ?? 0)}
          sub={`${num(stats.enCurso ?? 0)} en curso`}
        />
        <KpiCard
          label="Nuevos / recurrentes"
          value={`${num(stats.clientesNuevos ?? 0)} / ${num(stats.clientesRecurrentes ?? 0)}`}
          sub="primer pedido vs. ya conocido"
        />
        <KpiCard
          label="Costo de la promo"
          value={soles(stats.costoPromo ?? 0)}
          sub="envíos regalados, ya entregados"
        />
      </div>

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.07]">
          <div
            className={`h-full rounded-full ${agotada ? 'bg-danger' : 'bg-brand'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-subtle">
          {agotada
            ? 'Agotada: los pedidos nuevos ya pagan envío.'
            : `${num(usados)} de ${num(max)} comprometidos (${pct}%).`}
          {(stats.liberados ?? 0) > 0 &&
            ` ${num(stats.liberados ?? 0)} liberados por cancelación devolvieron su cupo.`}
        </p>
      </div>
    </div>
  )
}

export default function MetricasPage() {
  const [range, setRange] = useState('7d')
  const [tab, setTab] = useState<SubTab>('ventas')
  const [m, setM] = useState<Metrics | null>(null)
  const [promo, setPromo] = useState<PromoStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setM(null)
    api
      .get<ApiEnvelope<Metrics>>(`/admin/metrics?range=${range}`)
      .then((r) => setM(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [range])
  useEffect(() => {
    load()
  }, [load])

  // La promo NO depende del `range`: es su propia ventana. Se pide una sola vez
  // al montar, no en cada cambio de rango. Un fallo aquí deja la tarjeta oculta
  // en vez de romper la página: es un dato de apoyo, no la métrica principal.
  useEffect(() => {
    api
      .get<ApiEnvelope<PromoStats>>('/admin/promo')
      .then((r) => setPromo(r.data))
      .catch(() => setPromo(null))
  }, [])

  const series = m?.series ?? []
  // Los métodos sin pedidos en el rango ya no vienen de la RPC (`group by`), así
  // que no hay ceros que filtrar aquí. Los porcentajes se reparten por resto
  // mayor para que sumen 100 exacto.
  const payRows = m?.byPaymentReal ?? []
  const payPcts = sharePcts(payRows.map((r) => r.count))
  const payData = payRows.map((r, i) => ({
    label: PAYMENT_REAL_LABEL[r.method] ?? r.method,
    count: r.count,
    pct: payPcts[i] ?? 0,
  }))
  const funnel = m?.prepayFunnel ?? null
  const cancelData = (m?.byCancelReason ?? []).map((c) => ({
    label: CANCEL_LABEL[c.reason] ?? c.reason,
    count: c.count,
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SectionHeader
        eyebrow="Analítica"
        title="Métricas"
        description="Tendencias del negocio en el rango."
        right={<RangeTabs value={range} onChange={setRange} />}
      />

      <div className="sm:max-w-md">
        <Segmented options={SUBTABS} value={tab} onChange={setTab} />
      </div>

      {error && <p className="text-[14px] text-danger">{error}</p>}

      {!m ? (
        <div className="h-72 animate-pulse rounded-[28px] bg-ink/[0.05]" />
      ) : (
        <>
          {tab === 'ventas' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="GMV" value={soles(m.kpis.gmv)} tone="brand" />
                <KpiCard label="Comisión" value={soles(m.kpis.commission)} tone="success" />
                <KpiCard label="Pedidos" value={num(m.kpis.orders)} />
                <KpiCard label="Ticket prom." value={soles(m.kpis.avgTicket)} />
              </div>
              <PromoCard stats={promo} />
              <ChartCard title="Evolución de GMV y comisión">
                {series.length === 0 ? (
                  <EmptyState title="Sin datos en el rango" />
                ) : (
                  <SalesChart data={series} />
                )}
              </ChartCard>
              <ChartCard title="Pedidos y cancelaciones">
                {series.length === 0 ? (
                  <EmptyState title="Sin datos en el rango" />
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={series.map((s) => ({ ...s, label: dayLabel(s.bucket) }))}
                        margin={{ top: 8, right: 6, bottom: 0, left: 0 }}
                      >
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: '#a8a29e' }}
                          minTickGap={18}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          cursor={{ fill: 'rgba(26,22,20,0.04)' }}
                        />
                        <Bar
                          dataKey="orders"
                          isAnimationActive={false}
                          name="Pedidos"
                          fill="#F97316"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        />
                        <Bar
                          dataKey="cancelled"
                          isAnimationActive={false}
                          name="Cancelados"
                          fill="#FDBA74"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Cómo se pagó (pedidos entregados)">
                {payData.length === 0 ? (
                  <EmptyState title="Sin pedidos entregados en el rango" />
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="h-56 w-full sm:w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={payData}
                            dataKey="count"
                            nameKey="label"
                            innerRadius={50}
                            outerRadius={82}
                            paddingAngle={2}
                            stroke="none"
                            isAnimationActive={false}
                          >
                            {payData.map((p, i) => (
                              <Cell key={p.label} fill={PIE[i % PIE.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="w-full space-y-1.5 sm:w-1/2">
                      {payData.map((p, i) => (
                        <li
                          key={p.label}
                          className="flex items-center justify-between gap-3 text-[13px]"
                        >
                          <span className="flex items-center gap-2 text-ink-muted">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: PIE[i % PIE.length] }}
                            />
                            {p.label}
                          </span>
                          <span className="font-mono text-ink tabular-nums">
                            {p.count} · {p.pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ChartCard>

              {funnel && funnel.customers > 0 && (
                <ChartCard title="Primer pedido: ¿cuántos completan el prepago?">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <DonutMini
                      pct={funnel.conversionPct}
                      label={`${num(funnel.customersConverted)} de ${num(funnel.customers)} clientes nuevos`}
                      sublabel={`${num(funnel.attempts)} intento(s) de primer pedido`}
                    />
                    <ul className="w-full space-y-1.5 text-[13px] sm:w-1/2">
                      {(
                        [
                          ['Completó y recibió', funnel.delivered],
                          ['No envió comprobante a tiempo', funnel.prepayTimeout],
                          ['El negocio no validó a tiempo', funnel.validationTimeout],
                          ['Comprobante rechazado', funnel.proofRejected],
                          ['Otra cancelación', funnel.otherCancelled],
                          ['Todavía en curso', funnel.inProgress],
                        ] as [string, number][]
                      )
                        .filter(([, v]) => v > 0)
                        .map(([label, v]) => (
                          <li key={label} className="flex items-center justify-between gap-3">
                            <span className="text-ink-muted">{label}</span>
                            <span className="font-mono text-ink tabular-nums">{num(v)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <p className="mt-3 text-[12px] leading-snug text-ink-subtle">
                    Solo cuenta a quien llegó a crear el pedido. Quien vio “el pago es adelantado” y
                    cerró la app no deja rastro en la base — ese abandono no está medido.
                  </p>
                </ChartCard>
              )}
            </>
          )}

          {tab === 'negocios' && (
            <ChartCard title="GMV por negocio">
              {m.byBusiness.length === 0 ? (
                <EmptyState title="Sin datos en el rango" />
              ) : (
                <div className="w-full" style={{ height: Math.max(180, m.byBusiness.length * 52) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={m.byBusiness}
                      margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#a8a29e' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: '#57534e' }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'rgba(26,22,20,0.04)' }}
                        formatter={(v) => soles(Number(v))}
                      />
                      <Bar
                        dataKey="gmv"
                        isAnimationActive={false}
                        name="GMV"
                        fill="#F97316"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={26}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          )}

          {tab === 'motorizados' && (
            <ChartCard title="Entregas por motorizado">
              {m.byDriver.length === 0 ? (
                <EmptyState title="Sin datos en el rango" />
              ) : (
                <div className="w-full" style={{ height: Math.max(180, m.byDriver.length * 52) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={m.byDriver}
                      margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#a8a29e' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: '#57534e' }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'rgba(26,22,20,0.04)' }}
                      />
                      <Bar
                        dataKey="deliveries"
                        isAnimationActive={false}
                        name="Entregas"
                        fill="#F97316"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={26}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          )}

          {tab === 'cancelaciones' && (
            <ChartCard title="Razones de cancelación">
              {cancelData.length === 0 ? (
                <EmptyState
                  title="Sin cancelaciones en el rango"
                  hint="Ningún pedido cancelado. 🎉"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-56 w-full sm:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cancelData}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={50}
                          outerRadius={82}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {cancelData.map((c, i) => (
                            <Cell key={c.label} fill={PIE[i % PIE.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full space-y-1.5 sm:w-1/2">
                    {cancelData.map((c, i) => (
                      <li
                        key={c.label}
                        className="flex items-center justify-between gap-3 text-[13px]"
                      >
                        <span className="flex items-center gap-2 text-ink-muted">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: PIE[i % PIE.length] }}
                          />
                          {c.label}
                        </span>
                        <span className="font-mono text-ink tabular-nums">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}
