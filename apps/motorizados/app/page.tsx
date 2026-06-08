'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)
const PAYMENT_LABEL: Record<string, string> = {
  prepaid: 'Prepago Yape',
  pending_yape: 'Yape al recibir',
  pending_cash: 'Efectivo',
  pending_mixed: 'Mixto',
}

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'fake_address', label: 'Dirección falsa o inexistente' },
  { value: 'customer_abuse', label: 'Cliente agresivo o abusivo' },
  { value: 'payment_fraud', label: 'Problema con el pago' },
  { value: 'other', label: 'Otro' },
]

interface Order {
  id: string
  short_id: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_reference: string | null
  order_amount: number
  delivery_method: string
  payment_intent: string
  driver_id: string | null
  created_at: string
}

const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'

export default function MotorizadoPage() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

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
  return <Board onSignOut={() => setAuthed(false)} />
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
    } else onAuthed()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <h1 className="mb-1 font-display font-semibold text-[26px] text-ink">Panel del motorizado</h1>
      <p className="mb-6 text-[15px] text-ink-muted">Ingresa con la cuenta que te dio Tindivo.</p>
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

function Board({ onSignOut }: { onSignOut: () => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [myDriverId, setMyDriverId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [avail, setAvail] = useState<{ available: boolean; withinSchedule: boolean } | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data, error: e } = await supabase
      .from('orders')
      .select(
        'id,short_id,status,customer_name,customer_phone,delivery_address,delivery_reference,order_amount,delivery_method,payment_intent,driver_id,created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setOrders(data as Order[])
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('drivers')
      .select('id')
      .maybeSingle()
      .then(({ data }) => setMyDriverId(data?.id ?? null))
    refetch()
    const channel = supabase
      .channel('drv-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const loadAvail = useCallback(() => {
    api
      .get<{ data: { available: boolean; withinSchedule: boolean } }>('/driver/availability')
      .then((r) => setAvail(r.data))
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadAvail()
  }, [loadAvail])

  async function toggleAvailability() {
    if (!avail) return
    setError(null)
    try {
      await api.post('/driver/availability', { available: !avail.available })
      loadAvail()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    }
  }

  const available = orders.filter((o) => o.status === 'waiting_driver' && o.driver_id == null)
  const mine = orders.filter(
    (o) =>
      o.driver_id != null &&
      o.driver_id === myDriverId &&
      !['delivered', 'cancelled'].includes(o.status),
  )

  async function transition(id: string, action: string, params: Record<string, unknown> = {}) {
    setError(null)
    try {
      await api.post(`/driver/orders/${id}/transition`, { action, ...params })
      await refetch()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    }
  }

  async function reportIncident(
    orderId: string,
    incidentType: string,
    description: string,
  ): Promise<boolean> {
    setError(null)
    try {
      await api.post(
        '/driver/incidents',
        { orderId, incidentType, description: description || undefined },
        crypto.randomUUID(),
      )
      return true
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
      return false
    }
  }

  return (
    <div className="mx-auto max-w-[768px] px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
            Tindivo · Motorizado
          </p>
          <h1 className="font-display font-semibold text-[24px] text-ink">Mis entregas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/efectivo">
            <Button size="sm" variant="outline">
              Efectivo
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await getSupabaseBrowser().auth.signOut()
              onSignOut()
            }}
          >
            Salir
          </Button>
        </div>
      </header>

      {avail && (
        <button
          type="button"
          onClick={toggleAvailability}
          className={`mb-4 flex w-full items-center justify-between rounded-2xl px-4 py-3 ${avail.available ? 'bg-success/15' : 'bg-ink/[0.04]'}`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${avail.available ? 'bg-success' : 'bg-ink-subtle'}`}
            />
            <span className="font-semibold text-[15px] text-ink">
              {avail.available ? 'Estás disponible' : 'No disponible'}
            </span>
          </span>
          <span className="text-[13px] text-ink-muted">
            {avail.available
              ? 'Tocar para descansar'
              : avail.withinSchedule
                ? 'Tocar para recibir pedidos'
                : 'Fuera de horario'}
          </span>
        </button>
      )}

      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      <h2 className="mb-2 font-display font-semibold text-[16px] text-ink">
        Activos ({mine.length})
      </h2>
      {mine.length === 0 ? (
        <p className="mb-6 text-[14px] text-ink-subtle">No tienes pedidos activos.</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {mine.map((o) => (
            <li key={o.id}>
              <DriverCard order={o} onTransition={transition} onReport={reportIncident} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 font-display font-semibold text-[16px] text-ink">
        Disponibles ({available.length})
      </h2>
      {available.length === 0 ? (
        <p className="text-[14px] text-ink-subtle">Sin pedidos disponibles ahora.</p>
      ) : (
        <ul className="space-y-3">
          {available.map((o) => (
            <li key={o.id}>
              <DriverCard order={o} onTransition={transition} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DriverCard({
  order,
  onTransition,
  onReport,
}: {
  order: Order
  onTransition: (id: string, action: string, params?: Record<string, unknown>) => Promise<void>
  onReport?: (orderId: string, incidentType: string, description: string) => Promise<boolean>
}) {
  const [band, setBand] = useState<'near' | 'far'>('near')
  const [payment, setPayment] = useState<'paid_cash' | 'paid_yape'>('paid_cash')
  const [busy, setBusy] = useState(false)
  const [noShowArmed, setNoShowArmed] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [incidentType, setIncidentType] = useState('')
  const [incidentDesc, setIncidentDesc] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const run = async (action: string, params?: Record<string, unknown>) => {
    setBusy(true)
    await onTransition(order.id, action, params)
    setBusy(false)
  }

  const submitReport = async () => {
    if (!onReport || !incidentType) return
    setReportBusy(true)
    const ok = await onReport(order.id, incidentType, incidentDesc)
    setReportBusy(false)
    if (ok) {
      setReportDone(true)
      setReportOpen(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <p className="font-mono text-[13px] text-ink">#{order.short_id}</p>
        <p className="font-medium text-[15px] text-ink">{order.customer_name ?? 'Cliente'}</p>
        <p className="text-[13px] text-ink-muted">
          {soles(order.order_amount)} ·{' '}
          {PAYMENT_LABEL[order.payment_intent] ?? order.payment_intent}
        </p>
        {order.delivery_reference && (
          <p className="mt-1 text-[13px] text-ink-subtle">📍 {order.delivery_reference}</p>
        )}
        {order.customer_phone && (
          <p className="text-[13px] text-ink-subtle">📞 {order.customer_phone}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {order.status === 'waiting_driver' && (
            <Button size="sm" disabled={busy} onClick={() => run('take')}>
              Tomar pedido
            </Button>
          )}
          {order.status === 'heading_to_restaurant' && (
            <Button size="sm" disabled={busy} onClick={() => run('arrived')}>
              Llegué al local
            </Button>
          )}
          {order.status === 'waiting_at_restaurant' && (
            <>
              <div className="flex gap-1">
                {(['near', 'far'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBand(b)}
                    className={`h-9 rounded-lg border px-3 text-[13px] ${band === b ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-ink-muted'}`}
                  >
                    {b === 'near' ? 'Cerca' : 'Lejos'}
                  </button>
                ))}
              </div>
              <Button size="sm" disabled={busy} onClick={() => run('pickup', { band })}>
                Recoger
              </Button>
            </>
          )}
          {order.status === 'picked_up' && (
            <>
              <div className="flex gap-1">
                {(['paid_cash', 'paid_yape'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPayment(p)}
                    className={`h-9 rounded-lg border px-3 text-[13px] ${payment === p ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-ink-muted'}`}
                  >
                    {p === 'paid_cash' ? 'Efectivo' : 'Yape'}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run('deliver', { paymentReal: payment })}
              >
                Marcar entregado
              </Button>
            </>
          )}
        </div>

        {order.status === 'picked_up' && (
          <div className="mt-2 border-border border-t pt-2">
            {!noShowArmed ? (
              <button
                type="button"
                className="text-[13px] text-danger underline"
                disabled={busy}
                onClick={() => setNoShowArmed(true)}
              >
                El cliente no se presentó
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-ink-muted">
                  Espera 5 min e intenta contactar. Reportar genera un strike.
                </span>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => run('no_show')}>
                  Sí, reportar no-show
                </Button>
                <button
                  type="button"
                  className="text-[13px] text-ink-subtle"
                  onClick={() => setNoShowArmed(false)}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {onReport && (
          <div className="mt-2 border-border border-t pt-2">
            {reportDone ? (
              <p className="text-[13px] text-success">✓ Reporte enviado. El equipo lo revisará.</p>
            ) : !reportOpen ? (
              <button
                type="button"
                className="text-[13px] text-ink-subtle underline"
                onClick={() => setReportOpen(true)}
              >
                Reportar problema
              </button>
            ) : (
              <div className="space-y-2">
                <p className="font-medium text-[13px] text-ink">¿Qué problema hubo?</p>
                <div className="flex flex-wrap gap-1.5">
                  {INCIDENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setIncidentType(t.value)}
                      className={`h-9 rounded-lg border px-3 text-[13px] ${incidentType === t.value ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-ink-muted'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={incidentDesc}
                  onChange={(e) => setIncidentDesc(e.target.value)}
                  placeholder="Detalle (opcional)"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-brand"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={reportBusy || !incidentType}
                    onClick={submitReport}
                  >
                    {reportBusy ? 'Enviando…' : 'Enviar reporte'}
                  </Button>
                  <button
                    type="button"
                    className="text-[13px] text-ink-subtle"
                    onClick={() => {
                      setReportOpen(false)
                      setIncidentType('')
                      setIncidentDesc('')
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
