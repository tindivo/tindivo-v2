'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  validando: { label: 'Validando', cls: 'bg-info/15 text-info' },
  pending_acceptance: { label: 'Por aceptar', cls: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Confirmado', cls: 'bg-info/15 text-info' },
  preparing: { label: 'Preparando', cls: 'bg-brand-light text-brand-dark' },
  waiting_driver: { label: 'Busca moto', cls: 'bg-brand-light text-brand-dark' },
  heading_to_restaurant: { label: 'Moto en camino', cls: 'bg-brand-light text-brand-dark' },
  waiting_at_restaurant: { label: 'Moto en local', cls: 'bg-brand-light text-brand-dark' },
  picked_up: { label: 'En reparto', cls: 'bg-info/15 text-info' },
  delivered: { label: 'Entregado', cls: 'bg-success/15 text-success' },
  cancelled: { label: 'Cancelado', cls: 'bg-danger/15 text-danger' },
}

interface OrderRow {
  id: string
  short_id: string
  order_number: number
  status: string
  customer_name: string | null
  order_amount: number
  tindivo_commission: number | null
  delivery_method: string
  created_at: string
}

type Tab =
  | 'dashboard'
  | 'orders'
  | 'reports'
  | 'cash'
  | 'contingency'
  | 'settlements'
  | 'negocios'
  | 'motorizados'
  | 'audit'
  | 'business'
  | 'driver'
  | 'config'

interface CashDisputeRow {
  id: string
  settlement_date: string
  total_cash: number
  delivered_amount: number | null
  reported_amount: number | null
  status: string
  dispute_note: string | null
  businesses: { name: string } | null
  drivers: { full_name: string } | null
}

interface SettlementRow {
  id: string
  period_start: string
  period_end: string
  order_count: number
  total_amount: number
  status: string
  due_date: string
  businesses: { name: string } | null
}

interface ReportRow {
  id: string
  type: string
  status: string
  customer_phone: string | null
  description: string | null
  created_at: string
  orders: { short_id: string } | null
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  no_show: 'No-show',
  rejected_proof_disputed: 'Comprobante disputado',
  cash_difference: 'Diferencia de efectivo',
  restaurant_fake: 'Pedido fantasma',
  strike_reactivation: 'Reactivación de strike',
  advance_dispute: 'Disputa de adelanto',
}

const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'

export default function AdminDashboard() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        setAuthed(!!data.session)
        setReady(true)
      })
  }, [])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
            Tindivo · Sala de control
          </p>
          <h1 className="font-display font-semibold text-[28px] text-ink">Admin</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await getSupabaseBrowser().auth.signOut()
            setAuthed(false)
          }}
        >
          Salir
        </Button>
      </header>

      <nav className="mb-6 flex gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['orders', 'Pedidos'],
            ['reports', 'Reportes'],
            ['cash', 'Efectivo'],
            ['contingency', 'Contingencia'],
            ['settlements', 'Cobros'],
            ['negocios', 'Negocios'],
            ['motorizados', 'Motorizados'],
            ['audit', 'Auditoría'],
            ['business', '+ Negocio'],
            ['driver', '+ Motorizado'],
            ['config', 'Configuración'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-xl px-3 text-[14px] ${tab === t ? 'bg-brand text-white' : 'bg-card text-ink-muted'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <DashboardPanel />}
      {tab === 'orders' && <OrdersPanel />}
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'cash' && <CashDisputesPanel />}
      {tab === 'contingency' && <ContingencyPanel />}
      {tab === 'settlements' && <SettlementsPanel />}
      {tab === 'negocios' && <ManageBusinessesPanel />}
      {tab === 'motorizados' && <ManageDriversPanel />}
      {tab === 'audit' && <AuditPanel />}
      {tab === 'business' && <CreateBusinessPanel />}
      {tab === 'driver' && <CreateDriverPanel />}
      {tab === 'config' && <ConfigPanel />}
    </div>
  )
}

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      onAuthed()
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <h1 className="mb-1 font-display font-semibold text-[26px] text-ink">Admin Tindivo</h1>
      <p className="mb-6 text-[15px] text-ink-muted">Sala de control del fundador.</p>
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className={labelCls}>Correo</span>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Contraseña</span>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="text-danger text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}

interface Metrics {
  kpis: {
    orders: number
    delivered: number
    inProgress: number
    cancelled: number
    cancelledPct: number
    gmv: number
    commission: number
    avgTicket: number
    avgMinutes: number
    onTimePct: number
    cash: number
  }
  monitor: {
    pendingAcceptance: number
    waitingDriver: number
    headingToRestaurant: number
    pickedUp: number
  }
  byBusiness: {
    name: string
    total: number
    delivered: number
    cancelled: number
    gmv: number
    commission: number
  }[]
  byDriver: { name: string; deliveries: number; inProgress: number; gmv: number }[]
  byCancelReason: { reason: string; count: number }[]
}

const RANGES: [string, string][] = [
  ['today', 'Hoy'],
  ['7d', '7 días'],
  ['30d', '30 días'],
]
const CANCEL_LABEL: Record<string, string> = {
  pending_acceptance_timeout: 'No aceptado a tiempo',
  validation_timeout: 'Sin validar',
  prepay_timeout: 'Prepago sin comprobante',
  business_cancelled: 'Negocio canceló',
  admin_cancelled: 'Admin canceló',
  customer_cancelled: 'Cliente canceló',
  no_show: 'No-show',
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="font-display font-semibold text-[22px] text-ink">{value}</p>
      <p className="text-[12px] text-ink-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-subtle">{sub}</p>}
    </div>
  )
}

function DashboardPanel() {
  const [range, setRange] = useState('today')
  const [m, setM] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setM(null)
    api
      .get<ApiEnvelope<Metrics>>(`/admin/metrics?range=${range}`)
      .then((r) => setM(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [range])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {RANGES.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setRange(v)}
              className={`h-8 rounded-lg px-3 text-[13px] ${range === v ? 'bg-ink text-white' : 'bg-card text-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          Refrescar
        </Button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
      {!m ? (
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      ) : (
        <>
          <div>
            <p className={labelCls}>KPIs del rango</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi
                label="Pedidos"
                value={String(m.kpis.orders)}
                sub={`${m.kpis.delivered} entreg · ${m.kpis.inProgress} en curso`}
              />
              <Kpi
                label="Cancelados"
                value={String(m.kpis.cancelled)}
                sub={`${m.kpis.cancelledPct}% del total`}
              />
              <Kpi label="GMV" value={soles(m.kpis.gmv)} />
              <Kpi label="Comisión Tindivo" value={soles(m.kpis.commission)} />
              <Kpi label="Ticket promedio" value={soles(m.kpis.avgTicket)} />
              <Kpi label="Tiempo promedio" value={`${m.kpis.avgMinutes} min`} />
              <Kpi label="A tiempo" value={`${m.kpis.onTimePct}%`} />
              <Kpi label="Efectivo entregado" value={soles(m.kpis.cash)} />
            </div>
          </div>

          <div>
            <p className={labelCls}>Monitor en vivo</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Por aceptar" value={String(m.monitor.pendingAcceptance)} />
              <Kpi label="Esperando moto" value={String(m.monitor.waitingDriver)} />
              <Kpi label="Moto al local" value={String(m.monitor.headingToRestaurant)} />
              <Kpi label="En entrega" value={String(m.monitor.pickedUp)} />
            </div>
          </div>

          <Card>
            <CardBody>
              <p className="mb-2 font-display font-semibold text-[15px] text-ink">Por negocio</p>
              {m.byBusiness.length === 0 ? (
                <p className="text-[14px] text-ink-subtle">Sin datos en el rango.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="font-mono text-[11px] text-ink-subtle uppercase">
                      <tr>
                        <th className="py-1">Negocio</th>
                        <th className="text-right">Ped.</th>
                        <th className="text-right">Entreg.</th>
                        <th className="text-right">GMV</th>
                        <th className="text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.byBusiness.map((b, i) => (
                        <tr key={`${b.name}-${i}`} className="border-border border-t">
                          <td className="py-1">{b.name}</td>
                          <td className="text-right font-mono">{b.total}</td>
                          <td className="text-right font-mono">{b.delivered}</td>
                          <td className="text-right font-mono">{soles(b.gmv)}</td>
                          <td className="text-right font-mono">{soles(b.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="mb-2 font-display font-semibold text-[15px] text-ink">Por motorizado</p>
              {m.byDriver.length === 0 ? (
                <p className="text-[14px] text-ink-subtle">Sin datos en el rango.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="font-mono text-[11px] text-ink-subtle uppercase">
                      <tr>
                        <th className="py-1">Motorizado</th>
                        <th className="text-right">Entregas</th>
                        <th className="text-right">En curso</th>
                        <th className="text-right">GMV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.byDriver.map((d, i) => (
                        <tr key={`${d.name}-${i}`} className="border-border border-t">
                          <td className="py-1">{d.name}</td>
                          <td className="text-right font-mono">{d.deliveries}</td>
                          <td className="text-right font-mono">{d.inProgress}</td>
                          <td className="text-right font-mono">{soles(d.gmv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {m.byCancelReason.length > 0 && (
            <Card>
              <CardBody>
                <p className="mb-2 font-display font-semibold text-[15px] text-ink">
                  Razones de cancelación
                </p>
                <ul className="space-y-1">
                  {m.byCancelReason.map((c) => (
                    <li key={c.reason} className="flex justify-between text-[14px]">
                      <span className="text-ink-muted">{CANCEL_LABEL[c.reason] ?? c.reason}</span>
                      <span className="font-mono">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

const ACTIVE_STATUSES = new Set([
  'validando',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
])

function OrdersPanel() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelShort, setCancelShort] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<OrderRow[]>>('/admin/orders')
      .then((r) => setOrders(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function doCancel() {
    if (!cancelId || note.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/orders/${cancelId}/cancel`, { note: note.trim() })
      setCancelId(null)
      setNote('')
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  if (error && !orders) return <p className="text-danger">{error}</p>
  if (!orders) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] text-ink-muted">{orders.length} pedidos recientes</p>
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        </div>
        {error && <p className="mb-2 text-danger text-sm">{error}</p>}
        {cancelId && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-2">
            <span className="text-[13px] text-danger">Cancelar #{cancelShort}:</span>
            <input
              className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand"
              placeholder="Motivo (obligatorio)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" disabled={busy || note.trim().length < 3} onClick={doCancel}>
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>
              Cerrar
            </Button>
          </div>
        )}
        {orders.length === 0 ? (
          <p className="py-8 text-center text-ink-subtle">Aún no hay pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="font-mono text-[11px] text-ink-subtle uppercase">
                <tr>
                  <th className="py-2">Código</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th className="text-right">Monto</th>
                  <th className="text-right">Comisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const s = STATUS_LABEL[o.status] ?? {
                    label: o.status,
                    cls: 'bg-card text-ink-muted',
                  }
                  return (
                    <tr key={o.id} className="border-border border-t">
                      <td className="py-2 font-mono">#{o.short_id}</td>
                      <td>{o.customer_name ?? '—'}</td>
                      <td>
                        <span className={`rounded-lg px-2 py-0.5 text-[12px] ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="text-right font-mono">{soles(o.order_amount)}</td>
                      <td className="text-right font-mono">{soles(o.tindivo_commission)}</td>
                      <td className="text-right">
                        {ACTIVE_STATUSES.has(o.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelId(o.id)
                              setCancelShort(o.short_id)
                              setNote('')
                            }}
                            className="rounded-lg px-2 py-1 text-[12px] text-danger hover:bg-danger/10"
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ReportsPanel() {
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<ReportRow[]>>('/admin/reports?status=open')
      .then((r) => setReports(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(id: string, status: 'resolved' | 'dismissed') {
    setBusyId(id)
    try {
      await api.post(`/admin/reports/${id}/resolve`, { status })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <p className="text-danger">{error}</p>
  if (!reports) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] text-ink-muted">{reports.length} reportes abiertos</p>
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        </div>
        {reports.length === 0 ? (
          <p className="py-8 text-center text-ink-subtle">Bandeja limpia. Nada pendiente. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="rounded-lg bg-danger/15 px-2 py-0.5 text-[12px] text-danger">
                        {REPORT_TYPE_LABEL[r.type] ?? r.type}
                      </span>
                      {r.orders?.short_id && (
                        <span className="font-mono text-[13px] text-ink-muted">
                          #{r.orders.short_id}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[14px] text-ink">{r.description}</p>
                    {r.customer_phone && (
                      <p className="mt-0.5 text-[13px] text-ink-subtle">📞 {r.customer_phone}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => resolve(r.id, 'resolved')}
                    >
                      Resolver
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === r.id}
                      onClick={() => resolve(r.id, 'dismissed')}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function CashDisputesPanel() {
  const [rows, setRows] = useState<CashDisputeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<CashDisputeRow[]>>('/admin/cash-settlements?status=disputed')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(row: CashDisputeRow) {
    const note = (notes[row.id] ?? '').trim()
    const amount = Number(amounts[row.id] ?? row.reported_amount ?? row.delivered_amount ?? 0)
    if (!note) {
      setError('La nota de resolución es obligatoria.')
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await api.post(`/admin/cash-settlements/${row.id}/resolve`, { resolvedAmount: amount, note })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) return <p className="text-danger">{error}</p>
  if (!rows) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] text-ink-muted">{rows.length} disputas de efectivo abiertas</p>
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        </div>
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-ink-subtle">Sin disputas. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3">
                <p className="font-medium text-[15px] text-ink">
                  {r.businesses?.name ?? '—'} ↔ {r.drivers?.full_name ?? 'Motorizado'}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {r.settlement_date} · driver declaró {soles(r.delivered_amount)} · negocio contó{' '}
                  {soles(r.reported_amount)} · esperado {soles(r.total_cash)}
                </p>
                {r.dispute_note && (
                  <p className="mt-1 text-[13px] text-ink-subtle">“{r.dispute_note}”</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[13px] text-ink-muted">
                    Resolver S/
                    <input
                      className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-center font-mono outline-none focus:border-brand"
                      inputMode="decimal"
                      placeholder={String(r.reported_amount ?? r.delivered_amount ?? '')}
                      value={amounts[r.id] ?? ''}
                      onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                    />
                  </label>
                  <input
                    className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand"
                    placeholder="Nota de resolución (obligatoria)"
                    value={notes[r.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <Button size="sm" disabled={busyId === r.id} onClick={() => resolve(r)}>
                    Resolver
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

const ADVANCE_REASONS: { reason: string; actor: 'restaurante' | 'tindivo' }[] = [
  { reason: 'Prepago: el restaurante no aceptó en 5 min', actor: 'restaurante' },
  { reason: 'Prepago: el restaurante rechazó la captura sin razón válida', actor: 'restaurante' },
  { reason: 'Prepago: el restaurante no preparó a tiempo', actor: 'restaurante' },
  { reason: 'Prepago: el motorizado no recogió / abandonó el pedido', actor: 'tindivo' },
  { reason: 'Prepago: el cliente canceló en ventana libre', actor: 'tindivo' },
  { reason: 'Otro (especificar)', actor: 'restaurante' },
]

const ADVANCE_STATUS: Record<string, { label: string; cls: string }> = {
  activo: { label: 'Activo', cls: 'bg-info/15 text-info' },
  disputado: { label: 'En disputa', cls: 'bg-warning/15 text-warning' },
  cancelado: { label: 'Cancelado · Tindivo absorbe', cls: 'bg-card text-ink-muted' },
}

interface AdvanceRow {
  id: string
  amount: number
  reason: string
  actor_charged: string
  status: string
  proof_url: string | null
  dispute_note: string | null
  created_at: string
  customer_phone: string | null
  orders: { short_id: string; businesses: { name: string } | null } | null
}
interface FundInfo {
  current: number
  initial: number
  disputeWindowHours?: number
}

function ContingencyPanel() {
  const [advances, setAdvances] = useState<AdvanceRow[] | null>(null)
  const [fund, setFund] = useState<FundInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resAmounts, setResAmounts] = useState<Record<string, string>>({})
  const [resNotes, setResNotes] = useState<Record<string, string>>({})

  const [shortId, setShortId] = useState('')
  const [reasonIdx, setReasonIdx] = useState(0)
  const [customReason, setCustomReason] = useState('')
  const [actor, setActor] = useState<'restaurante' | 'tindivo'>('restaurante')
  const [amount, setAmount] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ advances: AdvanceRow[]; fund: FundInfo | null }>>('/admin/contingency')
      .then((r) => {
        setAdvances(r.data.advances)
        setFund(r.data.fund)
      })
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  function pickReason(i: number) {
    setReasonIdx(i)
    const r = ADVANCE_REASONS[i]
    if (r) setActor(r.actor)
  }

  async function submitAdvance(e: FormEvent) {
    e.preventDefault()
    setFormMsg(null)
    const isOtherReason = reasonIdx === ADVANCE_REASONS.length - 1
    const reason = isOtherReason ? customReason.trim() : (ADVANCE_REASONS[reasonIdx]?.reason ?? '')
    const amt = Number(amount)
    if (!shortId.trim() || !reason || !proofUrl.trim() || !(amt > 0)) {
      setFormMsg({ ok: false, text: 'Completa código, monto (>0), motivo y captura.' })
      return
    }
    setSubmitting(true)
    try {
      const { data: order } = await getSupabaseBrowser()
        .from('orders')
        .select('id')
        .eq('short_id', shortId.trim().toUpperCase())
        .maybeSingle()
      if (!order) throw new Error('No existe un pedido con ese código.')
      await api.post('/admin/contingency', {
        orderId: order.id,
        amount: amt,
        reason,
        actorCharged: actor,
        proofUrl: proofUrl.trim(),
      })
      setFormMsg({ ok: true, text: 'Adelanto registrado.' })
      setShortId('')
      setAmount('')
      setProofUrl('')
      setCustomReason('')
      load()
    } catch (err) {
      setFormMsg({
        ok: false,
        text:
          err instanceof ApiError ? (err.problem.detail ?? err.message) : (err as Error).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function resolve(row: AdvanceRow) {
    const note = (resNotes[row.id] ?? '').trim()
    const amt = Number(resAmounts[row.id] ?? row.amount)
    if (!note) {
      setError('La nota de resolución es obligatoria.')
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await api.post(`/admin/contingency/${row.id}/resolve`, { resolvedAmount: amt, note })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const isOtherReason = reasonIdx === ADVANCE_REASONS.length - 1

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <p className={labelCls}>Fondo de contingencia</p>
              <p className="font-display font-semibold text-[26px] text-ink">
                {fund ? soles(fund.current) : '—'}
              </p>
            </div>
            <p className="text-right text-[13px] text-ink-subtle">
              {fund ? `de ${soles(fund.initial)} inicial` : ''}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-2 font-display font-semibold text-[16px] text-ink">Registrar adelanto</p>
          <form onSubmit={submitAdvance} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Código de pedido</span>
              <input
                className={inputCls}
                value={shortId}
                onChange={(e) => setShortId(e.target.value)}
                placeholder="TND-XXXX"
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Monto adelantado (S/)</span>
              <input
                className={inputCls}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelCls}>Motivo</span>
              <select
                className={inputCls}
                value={reasonIdx}
                onChange={(e) => pickReason(Number(e.target.value))}
              >
                {ADVANCE_REASONS.map((r, i) => (
                  <option key={r.reason} value={i}>
                    {r.reason}
                  </option>
                ))}
              </select>
            </label>
            {isOtherReason && (
              <label className="block sm:col-span-2">
                <span className={labelCls}>Especifica el motivo</span>
                <input
                  className={inputCls}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              </label>
            )}
            <label className="block">
              <span className={labelCls}>Carga la pérdida</span>
              <select
                className={inputCls}
                value={actor}
                onChange={(e) => setActor(e.target.value as 'restaurante' | 'tindivo')}
              >
                <option value="restaurante">Restaurante (suma a su deuda)</option>
                <option value="tindivo">Tindivo absorbe</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Captura del Yape/Plin (URL)</span>
              <input
                className={inputCls}
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="Link o referencia"
                required
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Registrando…' : 'Registrar adelanto'}
              </Button>
            </div>
            {formMsg && (
              <p className={`sm:col-span-2 text-sm ${formMsg.ok ? 'text-success' : 'text-danger'}`}>
                {formMsg.text}
              </p>
            )}
          </form>
        </CardBody>
      </Card>

      {error && <p className="text-danger text-sm">{error}</p>}

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[14px] text-ink-muted">{advances?.length ?? 0} adelantos</p>
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
          </div>
          {!advances ? (
            <div className="h-24 animate-pulse rounded-2xl bg-card" />
          ) : advances.length === 0 ? (
            <p className="py-8 text-center text-ink-subtle">Sin adelantos registrados.</p>
          ) : (
            <ul className="space-y-3">
              {advances.map((a) => {
                const s = ADVANCE_STATUS[a.status] ?? {
                  label: a.status,
                  cls: 'bg-card text-ink-muted',
                }
                return (
                  <li key={a.id} className="rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-[12px] ${s.cls}`}>
                          {s.label}
                        </span>
                        <span className="font-mono font-semibold text-[15px]">
                          {soles(a.amount)}
                        </span>
                        {a.orders?.short_id && (
                          <span className="font-mono text-[13px] text-ink-muted">
                            #{a.orders.short_id}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[14px] text-ink">{a.reason}</p>
                      <p className="mt-0.5 text-[13px] text-ink-subtle">
                        {a.orders?.businesses?.name ?? '—'} · carga: {a.actor_charged}
                      </p>
                      {a.dispute_note && (
                        <p className="mt-1 text-[13px] text-warning">Disputa: “{a.dispute_note}”</p>
                      )}
                    </div>
                    {a.status === 'disputado' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-[13px] text-ink-muted">
                          Resolver S/
                          <input
                            className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-center font-mono outline-none focus:border-brand"
                            inputMode="decimal"
                            placeholder={String(a.amount)}
                            value={resAmounts[a.id] ?? ''}
                            onChange={(e) =>
                              setResAmounts({ ...resAmounts, [a.id]: e.target.value })
                            }
                          />
                        </label>
                        <input
                          className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand"
                          placeholder="Nota (0 = a favor del negocio)"
                          value={resNotes[a.id] ?? ''}
                          onChange={(e) => setResNotes({ ...resNotes, [a.id]: e.target.value })}
                        />
                        <Button size="sm" disabled={busyId === a.id} onClick={() => resolve(a)}>
                          Resolver
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

const WEEKDAYS: [string, string][] = [
  ['mon', 'Lun'],
  ['tue', 'Mar'],
  ['wed', 'Mié'],
  ['thu', 'Jue'],
  ['fri', 'Vie'],
  ['sat', 'Sáb'],
  ['sun', 'Dom'],
]

type Cfg = Record<string, unknown> | null | undefined
type SaveFn = (key: string, value: unknown) => void

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        className={inputCls}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function CommissionsCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const [near, setNear] = useState(String((value as { near?: number })?.near ?? ''))
  const [far, setFar] = useState(String((value as { far?: number })?.far ?? ''))
  const [pickup, setPickup] = useState(String((value as { pickup?: number })?.pickup ?? ''))
  return (
    <Card>
      <CardBody>
        <p className="mb-2 font-display font-semibold text-[15px] text-ink">
          Comisiones por pedido entregado (S/)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Cerca" value={near} onChange={setNear} />
          <NumberField label="Lejos" value={far} onChange={setFar} />
          <NumberField label="Recojo" value={pickup} onChange={setPickup} />
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            save('commissions', { near: Number(near), far: Number(far), pickup: Number(pickup) })
          }
        >
          Guardar comisiones
        </Button>
      </CardBody>
    </Card>
  )
}

function ScheduleCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const v = (value ?? {}) as { days?: string[]; startHHMM?: string; endHHMM?: string }
  const [days, setDays] = useState<string[]>(v.days ?? [])
  const [start, setStart] = useState(v.startHHMM ?? '18:00')
  const [end, setEnd] = useState(v.endHHMM ?? '23:00')
  const toggle = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  return (
    <Card>
      <CardBody>
        <p className="mb-2 font-display font-semibold text-[15px] text-ink">Horario operativo</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className={`h-9 rounded-lg px-3 text-[13px] ${days.includes(d) ? 'bg-brand text-white' : 'bg-card text-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelCls}>Inicio</span>
            <input
              type="time"
              className={inputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Fin (si ≤ inicio, cruza medianoche)</span>
            <input
              type="time"
              className={inputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => save('platform_schedule', { days, startHHMM: start, endHHMM: end })}
        >
          Guardar horario
        </Button>
      </CardBody>
    </Card>
  )
}

function SupportCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const [wa, setWa] = useState(typeof value === 'string' ? value : '')
  return (
    <Card>
      <CardBody>
        <p className="mb-2 font-display font-semibold text-[15px] text-ink">WhatsApp de soporte</p>
        <input
          className={inputCls}
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder="+51987654321"
        />
        <Button size="sm" className="mt-3" onClick={() => save('support_whatsapp', wa.trim())}>
          Guardar soporte
        </Button>
      </CardBody>
    </Card>
  )
}

function ThresholdsCard({
  prepay,
  validation,
  save,
}: {
  prepay: unknown
  validation: Cfg
  save: SaveFn
}) {
  const [pre, setPre] = useState(String(typeof prepay === 'number' ? prepay : ''))
  const [amt, setAmt] = useState(
    String((validation as { amountThreshold?: number })?.amountThreshold ?? ''),
  )
  return (
    <Card>
      <CardBody>
        <p className="mb-2 font-display font-semibold text-[15px] text-ink">Umbrales (S/)</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Prepago forzado ≥" value={pre} onChange={setPre} />
          <NumberField label="Validación por monto ≥" value={amt} onChange={setAmt} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => save('prepay_threshold', Number(pre))}>
            Guardar prepago
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => save('validation', { amountThreshold: Number(amt) })}
          >
            Guardar validación
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

const TIMER_FIELDS: [string, string][] = [
  ['acceptanceMinutes', 'Aceptación (min)'],
  ['validationMinutes', 'Validación (min)'],
  ['prepayVerificationMinutes', 'Prepago (min)'],
  ['prepExtensionMinutes', 'Prórroga prep. (min)'],
  ['maxPrepExtensions', 'Máx. prórrogas'],
  ['noShowWaitMinutes', 'Espera no-show (min)'],
  ['cashAutoConfirmHours', 'Auto-confirma efectivo (h)'],
]

function TimersCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const v = (value ?? {}) as Record<string, number>
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(TIMER_FIELDS.map(([k]) => [k, String(v[k] ?? '')])),
  )
  return (
    <Card>
      <CardBody>
        <p className="mb-2 font-display font-semibold text-[15px] text-ink">Tiempos (timers)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIMER_FIELDS.map(([k, label]) => (
            <NumberField
              key={k}
              label={label}
              value={draft[k] ?? ''}
              onChange={(val) => setDraft({ ...draft, [k]: val })}
            />
          ))}
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            save('timers', Object.fromEntries(TIMER_FIELDS.map(([k]) => [k, Number(draft[k])])))
          }
        >
          Guardar tiempos
        </Button>
      </CardBody>
    </Card>
  )
}

function ConfigPanel() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ key: string; value: unknown }[]>>('/admin/settings')
      .then((r) => setSettings(Object.fromEntries(r.data.map((s) => [s.key, s.value]))))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const save: SaveFn = async (key, value) => {
    setMsg(null)
    setError(null)
    try {
      await api.patch('/admin/settings', { key, value })
      setMsg(`Guardado: ${key}`)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    }
  }

  if (error && !settings) return <p className="text-danger">{error}</p>
  if (!settings) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <div className="space-y-3" key={JSON.stringify(settings)}>
      {msg && <p className="text-success text-sm">{msg}</p>}
      {error && <p className="text-danger text-sm">{error}</p>}
      <CommissionsCard value={settings.commissions as Cfg} save={save} />
      <ScheduleCard value={settings.platform_schedule as Cfg} save={save} />
      <ThresholdsCard
        prepay={settings.prepay_threshold}
        validation={settings.validation as Cfg}
        save={save}
      />
      <TimersCard value={settings.timers as Cfg} save={save} />
      <SupportCard value={settings.support_whatsapp as Cfg} save={save} />
    </div>
  )
}

interface BizRow {
  id: string
  name: string
  primary_capability: string
  is_active: boolean
  is_blocked: boolean
  balance_due: number
}

function openImpersonation(userKind: 'businesses' | 'drivers', id: string) {
  // resuelve user_id del negocio/driver y abre el magic-link en otra pestaña
  return async () => {
    const { data } = await getSupabaseBrowser()
      .from(userKind)
      .select('user_id')
      .eq('id', id)
      .maybeSingle()
    if (!data?.user_id) return
    try {
      const r = await api.post<ApiEnvelope<{ actionLink: string }>>(
        `/admin/impersonate/${data.user_id}`,
        {},
      )
      window.open(r.data.actionLink, '_blank', 'noopener')
    } catch {
      // silencioso: el admin reintenta
    }
  }
}

function ManageBusinessesPanel() {
  const [rows, setRows] = useState<BizRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [blockId, setBlockId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      setBlockId(null)
      setReason('')
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) return <p className="text-danger">{error}</p>
  if (!rows) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] text-ink-muted">{rows.length} negocios</p>
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        </div>
        {error && <p className="mb-2 text-danger text-sm">{error}</p>}
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[15px] text-ink">{b.name}</span>
                    {!b.is_active && (
                      <span className="rounded-lg bg-card px-2 py-0.5 text-[11px] text-ink-muted">
                        Inactivo
                      </span>
                    )}
                    {b.is_blocked && (
                      <span className="rounded-lg bg-danger/15 px-2 py-0.5 text-[11px] text-danger">
                        Bloqueado
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-subtle">
                    {b.primary_capability} · deuda {soles(b.balance_due)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === b.id}
                    onClick={() =>
                      act(
                        () => api.patch(`/admin/businesses/${b.id}`, { isActive: !b.is_active }),
                        b.id,
                      )
                    }
                  >
                    {b.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  {b.is_blocked ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === b.id}
                      onClick={() =>
                        act(() => api.post(`/admin/businesses/${b.id}/unblock`, {}), b.id)
                      }
                    >
                      Desbloquear
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setBlockId(blockId === b.id ? null : b.id)
                        setReason('')
                      }}
                    >
                      Bloquear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openImpersonation('businesses', b.id)}
                  >
                    Entrar como
                  </Button>
                </div>
              </div>
              {blockId === b.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand"
                    placeholder="Motivo del bloqueo (obligatorio)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busyId === b.id || reason.trim().length < 3}
                    onClick={() =>
                      act(() => api.post(`/admin/businesses/${b.id}/block`, { reason }), b.id)
                    }
                  >
                    Confirmar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

interface DrvRow {
  id: string
  full_name: string
  phone: string | null
  vehicle_type: string
  is_active: boolean
  driver_availability: { is_available: boolean } | null
}

function ManageDriversPanel() {
  const [rows, setRows] = useState<DrvRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<DrvRow[]>>('/admin/drivers')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(d: DrvRow) {
    setBusyId(d.id)
    setError(null)
    try {
      await api.patch(`/admin/drivers/${d.id}`, { isActive: !d.is_active })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) return <p className="text-danger">{error}</p>
  if (!rows) return <div className="h-40 animate-pulse rounded-2xl bg-card" />

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] text-ink-muted">{rows.length} motorizados</p>
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        </div>
        {error && <p className="mb-2 text-danger text-sm">{error}</p>}
        <ul className="space-y-2">
          {rows.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2">
                  <span className="font-semibold text-[15px] text-ink">{d.full_name}</span>
                  {d.driver_availability?.is_available ? (
                    <span className="rounded-lg bg-success/15 px-2 py-0.5 text-[11px] text-success">
                      Disponible
                    </span>
                  ) : (
                    <span className="rounded-lg bg-card px-2 py-0.5 text-[11px] text-ink-muted">
                      No disponible
                    </span>
                  )}
                  {!d.is_active && (
                    <span className="rounded-lg bg-danger/15 px-2 py-0.5 text-[11px] text-danger">
                      Desactivado
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-subtle">
                  {d.vehicle_type} · {d.phone ?? '—'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === d.id}
                  onClick={() => toggleActive(d)}
                >
                  {d.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button size="sm" variant="outline" onClick={openImpersonation('drivers', d.id)}>
                  Entrar como
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

interface AuditRow {
  id: string
  event_type: string
  actor_role: string | null
  created_at: string
  data: unknown
  orders: { short_id: string } | null
}

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shortId, setShortId] = useState('')

  const load = useCallback((sid: string) => {
    const q = sid.trim() ? `?shortId=${encodeURIComponent(sid.trim())}` : ''
    api
      .get<ApiEnvelope<AuditRow[]>>(`/admin/audit${q}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])
  useEffect(() => {
    load('')
  }, [load])

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center gap-2">
          <input
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-brand"
            placeholder="Filtrar por código de pedido (TND-XXXX)"
            value={shortId}
            onChange={(e) => setShortId(e.target.value)}
          />
          <Button size="sm" onClick={() => load(shortId)}>
            Buscar
          </Button>
        </div>
        {error && <p className="mb-2 text-danger text-sm">{error}</p>}
        {!rows ? (
          <div className="h-24 animate-pulse rounded-2xl bg-card" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-ink-subtle">Sin eventos.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((e) => (
              <li key={e.id} className="border-border border-t py-1.5 text-[13px]">
                <span className="font-mono text-ink">{e.event_type}</span>
                {e.orders?.short_id && (
                  <span className="ml-2 font-mono text-ink-muted">#{e.orders.short_id}</span>
                )}
                {e.actor_role && <span className="ml-2 text-ink-subtle">· {e.actor_role}</span>}
                <span className="ml-2 text-ink-subtle">
                  · {new Date(e.created_at).toLocaleString('es-PE')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

const STATEMENT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Por cobrar', cls: 'bg-warning/15 text-warning' },
  paid: { label: 'Pagado', cls: 'bg-success/15 text-success' },
  overdue: { label: 'Vencido', cls: 'bg-danger/15 text-danger' },
  cancelled: { label: 'Cancelado', cls: 'bg-card text-ink-muted' },
}

/** Lunes y domingo de la SEMANA PASADA + viernes de esta semana como vencimiento. */
function defaultPeriod() {
  const now = new Date()
  const diffToMon = (now.getDay() + 6) % 7
  const thisMon = new Date(now)
  thisMon.setDate(now.getDate() - diffToMon)
  const lastMon = new Date(thisMon)
  lastMon.setDate(thisMon.getDate() - 7)
  const lastSun = new Date(lastMon)
  lastSun.setDate(lastMon.getDate() + 6)
  const fri = new Date(thisMon)
  fri.setDate(thisMon.getDate() + 4)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(lastMon), end: fmt(lastSun), due: fmt(fri) }
}

function SettlementsPanel() {
  const init = defaultPeriod()
  const [period, setPeriod] = useState({ start: init.start, end: init.end, due: init.due })
  const [rows, setRows] = useState<SettlementRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<SettlementRow[]>>('/admin/settlements')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      await api.post('/admin/settlements', {
        periodStart: period.start,
        periodEnd: period.end,
        dueDate: period.due,
      })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setGenerating(false)
    }
  }

  async function pay(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/admin/settlements/${id}/pay`, { method: 'yape' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const totalPending = (rows ?? [])
    .filter((r) => r.status === 'pending' || r.status === 'overdue')
    .reduce((s, r) => s + Number(r.total_amount), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="mb-2 font-display font-semibold text-[16px] text-ink">
            Generar liquidaciones de la semana
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={labelCls}>Desde</span>
              <input
                type="date"
                className={inputCls}
                value={period.start}
                onChange={(e) => setPeriod({ ...period, start: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Hasta</span>
              <input
                type="date"
                className={inputCls}
                value={period.end}
                onChange={(e) => setPeriod({ ...period, end: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Vence</span>
              <input
                type="date"
                className={inputCls}
                value={period.due}
                onChange={(e) => setPeriod({ ...period, due: e.target.value })}
              />
            </label>
            <Button onClick={generate} disabled={generating}>
              {generating ? 'Generando…' : 'Generar'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && <p className="text-danger text-sm">{error}</p>}

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[14px] text-ink-muted">
              {rows?.length ?? 0} liquidaciones · por cobrar {soles(totalPending)}
            </p>
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
          </div>
          {!rows ? (
            <div className="h-24 animate-pulse rounded-2xl bg-card" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-ink-subtle">Aún no hay liquidaciones.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="font-mono text-[11px] text-ink-subtle uppercase">
                  <tr>
                    <th className="py-2">Negocio</th>
                    <th>Período</th>
                    <th className="text-right">Pedidos</th>
                    <th className="text-right">Monto</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = STATEMENT_STATUS[r.status] ?? {
                      label: r.status,
                      cls: 'bg-card text-ink-muted',
                    }
                    return (
                      <tr key={r.id} className="border-border border-t">
                        <td className="py-2">{r.businesses?.name ?? '—'}</td>
                        <td className="font-mono text-[12px] text-ink-muted">
                          {r.period_start} → {r.period_end}
                        </td>
                        <td className="text-right font-mono">{r.order_count}</td>
                        <td className="text-right font-mono">{soles(r.total_amount)}</td>
                        <td>
                          <span className={`rounded-lg px-2 py-0.5 text-[12px] ${s.cls}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="text-right">
                          {(r.status === 'pending' || r.status === 'overdue') && (
                            <Button size="sm" disabled={busyId === r.id} onClick={() => pay(r.id)}>
                              Marcar pagado
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function CreateBusinessPanel() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    tagline: '',
    accentColor: 'e11d48',
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const r = await api.post<ApiEnvelope<{ business: { id: string; name: string } }>>(
        '/admin/businesses',
        {
          ...form,
          publishesCatalog: true,
          acceptsWebPickup: true,
          acceptsWebDelivery: true,
          usesTindivoDrivers: true,
        },
      )
      setMsg({ ok: true, text: `Negocio "${r.data.business.name}" creado.` })
      setForm({ email: '', password: '', name: '', tagline: '', accentColor: 'e11d48' })
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Nombre del negocio</span>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Tagline</span>
            <input
              className={inputCls}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Correo de acceso</span>
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Contraseña (mín. 8)</span>
            <input
              className={inputCls}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Color de papelito (hex)</span>
            <input
              className={inputCls}
              value={form.accentColor}
              onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
              pattern="[0-9a-f]{6}"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creando…' : 'Crear negocio'}
            </Button>
          </div>
          {msg && (
            <p className={`sm:col-span-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>
              {msg.text}
            </p>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

function CreateDriverPanel() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    vehicleType: 'moto',
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const r = await api.post<ApiEnvelope<{ driver: { full_name: string } }>>(
        '/admin/drivers',
        form,
      )
      setMsg({ ok: true, text: `Motorizado "${r.data.driver.full_name}" creado.` })
      setForm({ email: '', password: '', fullName: '', phone: '', vehicleType: 'moto' })
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Nombre completo</span>
            <input
              className={inputCls}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Celular</span>
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Correo de acceso</span>
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Contraseña (mín. 8)</span>
            <input
              className={inputCls}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>Vehículo</span>
            <select
              className={inputCls}
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="moto">Moto</option>
              <option value="bici">Bici</option>
              <option value="auto">Auto</option>
              <option value="pie">A pie</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creando…' : 'Crear motorizado'}
            </Button>
          </div>
          {msg && (
            <p className={`sm:col-span-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>
              {msg.text}
            </p>
          )}
        </form>
      </CardBody>
    </Card>
  )
}
