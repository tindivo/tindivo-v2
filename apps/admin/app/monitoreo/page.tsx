'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button, Icon } from '@tindivo/ui'
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, KpiCard, SectionHeader } from '@/components/admin'
import { Ico } from '@/components/admin/icons'
import { api, errMsg } from '@/lib/api'
import { num, soles } from '@/lib/format'
import type { PromoStats } from '@/lib/types'

// ── Tipos de datos ─────────────────────────────────────────────────────────────

interface OnlineDaySeries {
  jornada: string
  creados: number
  entregados: number
  cancelados: number
  tasa_entrega: number
}

interface OnlineStatsTotals {
  creados: number
  entregados: number
  cancelados: number
  tasa_entrega: number
}

interface OnlineStatsResponse {
  from: string
  to: string
  series: OnlineDaySeries[]
  totals: OnlineStatsTotals
}

interface ActionableContact {
  phone: string
  customer_name: string
  segment: 'A' | 'B'
  orders_count: number
  businesses: string[]
}

interface BusinessConversionBreakdown {
  business_id: string
  name: string
  accent_color: string | null
  contacts_count: number
  orders_count: number
}

interface ConversionStatsResponse {
  summary: {
    total_directory_phones: number
    with_account: number
    without_account: number
    profiles_without_phone: number
  }
  segments: {
    A: number
    B: number
    C: number
    D: number
  }
  by_business: BusinessConversionBreakdown[]
  actionable_contacts: ActionableContact[]
}

type RangePreset = '7d' | '14d' | '30d' | 'custom'

const tooltipStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid #eae7e2',
  background: 'rgba(250,246,241,0.97)',
  fontSize: 13,
  boxShadow: '0 8px 24px rgb(26 22 20 / 0.1)',
}

function formatDateDisplay(yyyyMmDd: string): string {
  if (!yyyyMmDd || yyyyMmDd.length < 10) return yyyyMmDd
  const parts = yyyyMmDd.split('-')
  if (parts.length !== 3) return yyyyMmDd
  const day = parts[2]
  const month = parts[1]
  return `${day}/${month}`
}

function formatPhoneDisplay(p: string): string {
  if (p.length === 9) {
    return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`
  }
  return p
}

export default function MonitoreoPage() {
  // ── Estado: Filtros de Rango Online ──
  const [rangePreset, setRangePreset] = useState<RangePreset>('14d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // ── Estado: Datos ──
  const [onlineData, setOnlineData] = useState<OnlineStatsResponse | null>(null)
  const [onlineLoading, setOnlineLoading] = useState(true)
  const [onlineError, setOnlineError] = useState<string | null>(null)

  const [convData, setConvData] = useState<ConversionStatsResponse | null>(null)
  const [convLoading, setConvLoading] = useState(true)
  const [convError, setConvError] = useState<string | null>(null)

  const [promo, setPromo] = useState<PromoStats | null>(null)

  // ── Estado: Lista Nominal A+B ──
  const [showActionableList, setShowActionableList] = useState(false)
  const [searchContact, setSearchContact] = useState('')
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | 'A' | 'B'>('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 15
  const [copiedToast, setCopiedToast] = useState<string | null>(null)

  // Auto-dismiss toast
  useEffect(() => {
    if (!copiedToast) return
    const t = setTimeout(() => setCopiedToast(null), 3500)
    return () => clearTimeout(t)
  }, [copiedToast])

  // ── Cargar Pedidos Online ──
  const loadOnlineStats = useCallback(async () => {
    setOnlineLoading(true)
    setOnlineError(null)
    try {
      let query = ''
      const today = new Date()
      const toStr = today.toISOString().slice(0, 10)

      if (rangePreset === '7d') {
        const fromDate = new Date(today.getTime() - 6 * 86400000)
        query = `?from=${fromDate.toISOString().slice(0, 10)}&to=${toStr}`
      } else if (rangePreset === '14d') {
        const fromDate = new Date(today.getTime() - 13 * 86400000)
        query = `?from=${fromDate.toISOString().slice(0, 10)}&to=${toStr}`
      } else if (rangePreset === '30d') {
        const fromDate = new Date(today.getTime() - 29 * 86400000)
        query = `?from=${fromDate.toISOString().slice(0, 10)}&to=${toStr}`
      } else if (rangePreset === 'custom') {
        if (customFrom && customTo) {
          query = `?from=${customFrom}&to=${customTo}`
        }
      }

      const res = await api.get<ApiEnvelope<OnlineStatsResponse>>(`/admin/online-stats${query}`)
      setOnlineData(res.data)
    } catch (e) {
      setOnlineError(errMsg(e))
    } finally {
      setOnlineLoading(false)
    }
  }, [rangePreset, customFrom, customTo])

  // ── Cargar Oportunidad de Conversión ──
  const loadConversionStats = useCallback(async () => {
    setConvLoading(true)
    setConvError(null)
    try {
      const res = await api.get<ApiEnvelope<ConversionStatsResponse>>('/admin/conversion-stats')
      setConvData(res.data)
    } catch (e) {
      setConvError(errMsg(e))
    } finally {
      setConvLoading(false)
    }
  }, [])

  // ── Cargar Promo (oculta condicionalmente si no existe) ──
  useEffect(() => {
    api
      .get<ApiEnvelope<PromoStats>>('/admin/promo')
      .then((r) => setPromo(r.data))
      .catch(() => setPromo(null))
  }, [])

  useEffect(() => {
    loadOnlineStats()
  }, [loadOnlineStats])

  useEffect(() => {
    loadConversionStats()
  }, [loadConversionStats])

  const refreshAll = () => {
    loadOnlineStats()
    loadConversionStats()
  }

  // ── Filtrar Contactos A+B ──
  const filteredContacts = useMemo(() => {
    if (!convData?.actionable_contacts) return []
    const q = searchContact.trim().toLowerCase()
    return convData.actionable_contacts.filter((c) => {
      if (segmentFilter !== 'ALL' && c.segment !== segmentFilter) return false
      if (q) {
        const matchPhone = c.phone.includes(q)
        const matchName = c.customer_name.toLowerCase().includes(q)
        const matchBiz = c.businesses.some((b) => b.toLowerCase().includes(q))
        if (!matchPhone && !matchName && !matchBiz) return false
      }
      return true
    })
  }, [convData, searchContact, segmentFilter])

  const totalPages = Math.ceil(filteredContacts.length / pageSize) || 1
  const paginatedContacts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredContacts.slice(start, start + pageSize)
  }, [filteredContacts, page])

  // ── Copiar Lista A+B a CSV / Portapapeles ──
  const handleCopyCsv = () => {
    if (!filteredContacts.length) return
    const headers = 'Telefono,Nombre,Segmento,Pedidos_V2,Negocios\n'
    const rows = filteredContacts
      .map(
        (c) =>
          `"+51${c.phone}","${c.customer_name.replace(/"/g, '""')}","${c.segment}",${c.orders_count},"${c.businesses.join('; ')}"`,
      )
      .join('\n')
    navigator.clipboard.writeText(headers + rows)
    setCopiedToast(`¡${filteredContacts.length} contactos copiados en formato CSV para WhatsApp!`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Header General */}
      <SectionHeader
        eyebrow="Operación & Crecimiento"
        title="Monitoreo Online & Conversión"
        description="Seguimiento de pedidos online por jornada, análisis de conversión del directorio y contactos accionables para WhatsApp."
        right={
          <Button size="sm" variant="outline" onClick={refreshAll}>
            <Ico.refresh className="h-4 w-4" /> Refrescar
          </Button>
        }
      />

      {/* Toast Notification */}
      {copiedToast && (
        <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 flex items-center gap-2 text-sm font-bold shadow-lg animate-fade-in fixed bottom-6 right-6 z-50">
          <Ico.check className="h-5 w-5 shrink-0" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECCIÓN 1: PEDIDOS ONLINE POR JORNADA                                     */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="t-display text-[18px] text-ink flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-light text-brand-dark">
                <Ico.orders className="h-4 w-4" />
              </span>
              Pedidos Online por Jornada (PWA)
            </h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Agrupados por jornada operativa (corte 5:00 AM Lima), fuente{' '}
              <code className="text-brand font-mono font-semibold">customer_pwa</code>.
            </p>
          </div>

          {/* Selector de Rangos */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Excepción a check:ds — control segmentado, no un botón suelto. La
                superficie `bg-brand` marca CUÁL de los cuatro está activo dentro
                de un riel compartido; `<Button>` trae su propio alto y su radio
                `rounded-full`, y convertiría el riel en cuatro píldoras sueltas. */}
            <div className="flex bg-card rounded-xl p-1 border border-border">
              {(['7d', '14d', '30d', 'custom'] as RangePreset[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRangePreset(r)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    rangePreset === r
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {r === '7d'
                    ? '7 días'
                    : r === '14d'
                      ? '14 días'
                      : r === '30d'
                        ? '30 días'
                        : 'Personalizado'}
                </button>
              ))}
            </div>

            {rangePreset === 'custom' && (
              <div className="flex items-center gap-1.5 bg-card p-1 rounded-xl border border-border text-xs">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-ink outline-none"
                />
                <span className="text-ink-muted">a</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-ink outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {onlineError && <p className="text-sm font-semibold text-danger">{onlineError}</p>}

        {onlineLoading ? (
          <div className="h-64 animate-pulse rounded-[22px] bg-ink/[0.05]" />
        ) : !onlineData ? (
          <div className="t-card">
            <EmptyState title="Sin datos de pedidos online en este rango" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs Principales */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Total Creados"
                value={num(onlineData.totals.creados)}
                tone="brand"
                sub={`Del ${formatDateDisplay(onlineData.from)} al ${formatDateDisplay(onlineData.to)}`}
              />
              <KpiCard
                label="Entregados"
                value={num(onlineData.totals.entregados)}
                tone="success"
                sub="Completados con éxito"
              />
              <KpiCard
                label="Cancelados"
                value={num(onlineData.totals.cancelados)}
                tone={onlineData.totals.cancelados > 0 ? 'danger' : 'default'}
                sub="Cancelados / abandonados"
              />
              <KpiCard
                label="Tasa de Entrega"
                value={`${(onlineData.totals.tasa_entrega * 100).toFixed(1)}%`}
                tone={onlineData.totals.tasa_entrega >= 0.85 ? 'success' : 'brand'}
                sub="Entregados / Creados"
              />
            </div>

            {/* Gráfico de Barras */}
            <div className="t-card">
              <p className="t-display text-[15px] text-ink mb-3">Evolución de Pedidos Online</p>
              {onlineData.series.length === 0 ? (
                <EmptyState title="Sin pedidos online registrados en este rango de fechas." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={onlineData.series.map((s) => ({
                        ...s,
                        label: formatDateDisplay(s.jornada),
                      }))}
                      margin={{ top: 10, right: 10, bottom: 0, left: -15 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe6" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#78716c' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#78716c' }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
                      />
                      <Bar
                        dataKey="creados"
                        name="Creados"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                      <Bar
                        dataKey="entregados"
                        name="Entregados"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                      <Bar
                        dataKey="cancelados"
                        name="Cancelados"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Tabla Detallada */}
            {onlineData.series.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-surface text-[11px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                      <tr>
                        <th className="px-4 py-3">Jornada</th>
                        <th className="px-4 py-3 text-right">Creados</th>
                        <th className="px-4 py-3 text-right">Entregados</th>
                        <th className="px-4 py-3 text-right">Cancelados</th>
                        <th className="px-4 py-3 text-right">Tasa de Entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {onlineData.series.map((row) => (
                        <tr key={row.jornada} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                            {row.jornada} ({formatDateDisplay(row.jornada)})
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-ink">
                            {row.creados}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                            {row.entregados}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">
                            {row.cancelados}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-ink">
                            {(row.tasa_entrega * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-surface font-bold">
                      <tr>
                        <td className="px-4 py-3 text-ink">Totales del Rango</td>
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          {onlineData.totals.creados}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          {onlineData.totals.entregados}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-red-600">
                          {onlineData.totals.cancelados}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-brand">
                          {(onlineData.totals.tasa_entrega * 100).toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECCIÓN 2: OPORTUNIDAD DE CONVERSIÓN (DIRECTORIO VS CUENTAS)              */}
      {/* ========================================================================= */}
      <section className="space-y-4 pt-4 border-t border-border">
        <div>
          <h2 className="t-display text-[18px] text-ink flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <Ico.contacts className="h-4 w-4" />
            </span>
            Oportunidad de Conversión (Directorio vs Cuentas PWA)
          </h2>
          <p className="text-[12px] text-ink-muted mt-0.5">
            Cruce de 9 dígitos normalizados entre{' '}
            <code className="font-mono">address_directory</code> y{' '}
            <code className="font-mono">customer_profiles</code>, segmentado por pedidos reales de
            v2.
          </p>
        </div>

        {convError && <p className="text-sm font-semibold text-danger">{convError}</p>}

        {convLoading ? (
          <div className="h-64 animate-pulse rounded-[22px] bg-ink/[0.05]" />
        ) : !convData ? (
          <div className="t-card">
            <EmptyState title="No se pudo cargar la información de conversión" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Macro KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Directorio Total"
                value={num(convData.summary.total_directory_phones)}
                sub="Teléfonos únicos en agenda"
              />
              <KpiCard
                label="Con Cuenta PWA"
                value={num(convData.summary.with_account)}
                tone="success"
                sub={`${((convData.summary.with_account / (convData.summary.total_directory_phones || 1)) * 100).toFixed(1)}% del directorio`}
              />
              <KpiCard
                label="Sin Cuenta (Oportunidad)"
                value={num(convData.summary.without_account)}
                tone="brand"
                sub="Objetivo para campañas"
              />
              <KpiCard
                label="Cuentas sin Teléfono"
                value={num(convData.summary.profiles_without_phone)}
                tone="default"
                sub="Perfiles no cruzables"
              />
            </div>

            {/* Tarjetas de Segmentación */}
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted mb-3">
                Segmentación de Oportunidad (Por pedidos reales en v2)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Segmento A */}
                <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/40 p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black uppercase px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                      Segmento A
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                      5+ pedidos v2
                    </span>
                  </div>
                  <p className="text-3xl font-black text-ink">{num(convData.segments.A)}</p>
                  <p className="text-xs font-semibold text-emerald-900 leading-snug">
                    🔥 <strong>Máxima prioridad</strong>: Clientes muy frecuentes sin cuenta.
                  </p>
                </div>

                {/* Segmento B */}
                <div className="rounded-2xl border-2 border-brand/40 bg-brand-soft/40 p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black uppercase px-2 py-0.5 rounded-md bg-brand text-white">
                      Segmento B
                    </span>
                    <span className="text-[11px] font-bold text-brand-dark bg-brand/15 px-2 py-0.5 rounded-full">
                      2 a 4 pedidos v2
                    </span>
                  </div>
                  <p className="text-3xl font-black text-ink">{num(convData.segments.B)}</p>
                  <p className="text-xs font-semibold text-brand-dark leading-snug">
                    ⚡ <strong>Alta prioridad</strong>: Clientes recurrentes con hábito de pedido.
                  </p>
                </div>

                {/* Segmento C */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase px-2 py-0.5 rounded-md bg-ink/[0.08] text-ink">
                      Segmento C
                    </span>
                    <span className="text-[11px] font-semibold text-ink-muted">1 pedido v2</span>
                  </div>
                  <p className="text-3xl font-black text-ink">{num(convData.segments.C)}</p>
                  <p className="text-xs text-ink-muted leading-snug">
                    Ocasionales: Probaron el servicio una vez en v2.
                  </p>
                </div>

                {/* Segmento D: Marcado explícitamente como NO ACCIONABLE */}
                <div className="rounded-2xl border border-dashed border-ink/20 bg-ink/[0.03] p-4 space-y-2 opacity-80">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase px-2 py-0.5 rounded-md bg-ink/[0.1] text-ink-muted">
                      Segmento D
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      No accionable
                    </span>
                  </div>
                  <p className="text-3xl font-black text-ink-muted">{num(convData.segments.D)}</p>
                  <p className="text-xs text-ink-subtle leading-snug">
                    ⚠️ <strong>Histórico legacy</strong>: 0 pedidos en v2. No recomendado para
                    contacto directo.
                  </p>
                </div>
              </div>
            </div>

            {/* Desglose por Restaurante */}
            {convData.by_business.length > 0 && (
              <div className="t-card space-y-3">
                <p className="t-display text-[15px] text-ink">
                  Desglose de Oportunidad por Restaurante
                </p>
                <p className="text-xs text-ink-muted">
                  Dónde piden los clientes de la agenda que aún no han creado cuenta (un cliente
                  puede haber pedido en más de un restaurante).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  {convData.by_business.map((b) => (
                    <div
                      key={b.business_id}
                      className="rounded-xl border border-border bg-surface p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{
                            backgroundColor: b.accent_color ? `#${b.accent_color}` : '#f97316',
                          }}
                        />
                        <p className="font-bold text-sm text-ink truncate">{b.name}</p>
                      </div>
                      <p className="text-xl font-black text-ink">
                        {num(b.contacts_count)}{' '}
                        <span className="text-xs font-normal text-ink-muted">contactos</span>
                      </p>
                      <p className="text-[11px] text-ink-subtle font-mono">
                        {num(b.orders_count)} pedidos v2
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* LISTA NOMINAL ACCIONABLE (A + B)                                          */}
            {/* ========================================================================= */}
            <div className="rounded-2xl border-2 border-emerald-500/30 bg-card overflow-hidden shadow-xs">
              {/* Botón / Header Desplegable */}
              <button
                type="button"
                onClick={() => setShowActionableList((prev) => !prev)}
                className="w-full p-4 md:p-5 flex items-center justify-between gap-4 bg-emerald-50/50 hover:bg-emerald-50/80 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white font-bold">
                    <Ico.shield className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-base text-ink flex items-center gap-2">
                      Lista Nominal de Contactos Accionables (Segmentos A + B)
                      <span className="rounded-full bg-emerald-600 text-white text-xs px-2.5 py-0.5 font-mono font-bold">
                        {convData.actionable_contacts.length} contactos
                      </span>
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Clientes que han pedido 2 o más veces en v2 y no tienen cuenta. Insumo directo
                      para WhatsApp.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
                  <span>{showActionableList ? 'Ocultar lista' : 'Ver lista completa'}</span>
                  <span
                    className={`transform transition-transform ${showActionableList ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {/* Contenido Expandible */}
              {showActionableList && (
                <div className="p-4 md:p-5 space-y-4 border-t border-emerald-200/60 animate-fade-in">
                  {/* Barra de Filtros y Acciones */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
                      <div className="relative flex-1 min-w-[200px]">
                        <input
                          type="text"
                          placeholder="Buscar por teléfono, nombre o negocio..."
                          value={searchContact}
                          onChange={(e) => {
                            setSearchContact(e.target.value)
                            setPage(1)
                          }}
                          className="w-full h-9 rounded-xl border border-border bg-surface px-3 pl-8 text-xs text-ink outline-none focus:border-brand"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
                          <Ico.search className="h-3.5 w-3.5" />
                        </span>
                      </div>

                      {/* Excepción a check:ds — mismo caso que el selector de rango
                          de arriba: riel segmentado, la superficie dice cuál está
                          activo. */}
                      <div className="flex bg-surface rounded-xl p-0.5 border border-border text-xs">
                        {(['ALL', 'A', 'B'] as const).map((seg) => (
                          <button
                            key={seg}
                            type="button"
                            onClick={() => {
                              setSegmentFilter(seg)
                              setPage(1)
                            }}
                            className={`px-2.5 py-1 font-bold rounded-lg transition-colors ${
                              segmentFilter === seg
                                ? 'bg-card text-emerald-800 shadow-xs'
                                : 'text-ink-muted hover:text-ink'
                            }`}
                          >
                            {seg === 'ALL' ? 'Todos (A+B)' : `Segmento ${seg}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleCopyCsv}
                      disabled={filteredContacts.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    >
                      <Ico.audit className="h-4 w-4" /> Copiar CSV ({filteredContacts.length})
                    </Button>
                  </div>

                  {/* Tabla de Contactos */}
                  {filteredContacts.length === 0 ? (
                    <div className="t-card">
                      <EmptyState title="No se encontraron contactos que coincidan con la búsqueda." />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[650px]">
                          <thead className="border-b border-border bg-card text-[10px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                            <tr>
                              <th className="px-3.5 py-2.5">Teléfono</th>
                              <th className="px-3.5 py-2.5">Nombre</th>
                              <th className="px-3.5 py-2.5 text-center">Segmento</th>
                              <th className="px-3.5 py-2.5 text-right">Pedidos v2</th>
                              <th className="px-3.5 py-2.5">Negocios donde pide</th>
                              <th className="px-3.5 py-2.5 text-right">WhatsApp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-card">
                            {paginatedContacts.map((c) => (
                              <tr key={c.phone} className="hover:bg-surface transition-colors">
                                <td className="px-3.5 py-2.5 font-mono font-bold text-ink whitespace-nowrap">
                                  +51 {formatPhoneDisplay(c.phone)}
                                </td>
                                <td className="px-3.5 py-2.5 font-medium text-ink">
                                  {c.customer_name}
                                </td>
                                <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                                  <span
                                    className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                                      c.segment === 'A'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-brand-light text-brand-dark'
                                    }`}
                                  >
                                    Seg. {c.segment}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap">
                                  {c.orders_count} ped.
                                </td>
                                <td className="px-3.5 py-2.5 text-ink-muted truncate max-w-[200px]">
                                  {c.businesses.join(', ') || '-'}
                                </td>
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                  <a
                                    href={`https://wa.me/51${c.phone}?text=${encodeURIComponent(`Hola ${c.customer_name}, te saludamos de Tindivo!`)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition-colors"
                                  >
                                    <Icon name="chat" size={13} />
                                    Escribir
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Paginación */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <span className="font-mono text-xs text-ink-muted font-bold">
                        Página {page} de {totalPages} ({filteredContacts.length} contactos)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Siguiente
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECCIÓN 3: PROMO DE ENVÍO GRATIS (SI EXISTE)                              */}
      {/* ========================================================================= */}
      {promo?.configured && (
        <section className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="t-display text-[18px] text-ink flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white font-bold">
                %
              </span>
              Promo de Envío Gratis
            </h2>
            <span className="text-xs text-ink-subtle">
              {promo.from} → {promo.to} ·{' '}
              {promo.activa ? (
                <span className="font-bold text-success">activa</span>
              ) : (
                <span className="font-medium text-ink-muted">apagada</span>
              )}
            </span>
          </div>

          <div className="t-card space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Cupos restantes"
                value={num(promo.cuposRestantes ?? 0)}
                tone={(promo.cuposRestantes ?? 0) <= 0 ? 'danger' : 'brand'}
                sub={`de ${num(promo.maxRedemptions ?? 0)}`}
              />
              <KpiCard
                label="Redimidos"
                value={num(promo.redimidos ?? 0)}
                sub={`${num(promo.enCurso ?? 0)} en curso`}
              />
              <KpiCard
                label="Nuevos / Recurrentes"
                value={`${num(promo.clientesNuevos ?? 0)} / ${num(promo.clientesRecurrentes ?? 0)}`}
                sub="primer pedido vs ya conocido"
              />
              <KpiCard
                label="Costo de la promo"
                value={soles(promo.costoPromo ?? 0)}
                sub="envíos regalados entregados"
              />
            </div>

            <div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
                <div
                  className={`h-full rounded-full ${
                    (promo.cuposRestantes ?? 0) <= 0 ? 'bg-danger' : 'bg-brand'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(((promo.comprometidos ?? 0) / (promo.maxRedemptions || 1)) * 100),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-subtle">
                {(promo.cuposRestantes ?? 0) <= 0
                  ? 'Agotada: los pedidos nuevos ya pagan envío regular.'
                  : `${num(promo.comprometidos ?? 0)} de ${num(promo.maxRedemptions ?? 0)} comprometidos.`}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
