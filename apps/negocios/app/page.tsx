'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { useAudioAlert } from '@/lib/use-audio-alert'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)

const PAYMENT_LABEL: Record<string, string> = {
  prepaid: 'Prepago Yape',
  pending_yape: 'Yape al recibir',
  pending_cash: 'Efectivo',
  pending_mixed: 'Mixto',
}

interface Order {
  id: string
  short_id: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  delivery_reference: string | null
  order_amount: number
  payment_intent: string
  delivery_method: string
  prep_time_minutes: number | null
  created_at: string
}

const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'

export default function NegocioPage() {
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
      <h1 className="mb-1 font-display font-semibold text-[26px] text-ink">Panel del negocio</h1>
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
  const [bizName, setBizName] = useState<string>('Mi negocio')
  const [blocked, setBlocked] = useState<{ on: boolean; reason: string | null }>({
    on: false,
    reason: null,
  })
  const [soundOn, setSoundOn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data, error: e } = await supabase
      .from('orders')
      .select(
        'id,short_id,status,customer_name,customer_phone,delivery_reference,order_amount,payment_intent,delivery_method,prep_time_minutes,created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setOrders(data as Order[])
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('businesses')
      .select('name,is_blocked,block_reason')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setBizName(data.name)
        if (data) setBlocked({ on: data.is_blocked, reason: data.block_reason })
      })
    refetch()
    const channel = supabase
      .channel('biz-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const active = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const pendingCount = orders.filter((o) => o.status === 'pending_acceptance').length
  useAudioAlert(pendingCount > 0, soundOn)

  async function transition(id: string, action: string, params: Record<string, unknown> = {}) {
    setError(null)
    try {
      await api.post(`/business/orders/${id}/transition`, { action, ...params })
      await refetch()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    }
  }

  async function extendPrep(id: string) {
    setError(null)
    try {
      await api.post(`/business/orders/${id}/extend-prep`, {})
      await refetch()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    }
  }

  async function validate(id: string, pass: boolean) {
    setError(null)
    try {
      await api.post(`/business/orders/${id}/validate`, { pass })
      await refetch()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
            {bizName}
          </p>
          <h1 className="font-display font-semibold text-[24px] text-ink">Pedidos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/menu">
            <Button size="sm" variant="outline">
              Menú
            </Button>
          </Link>
          <Link href="/efectivo">
            <Button size="sm" variant="outline">
              Efectivo
            </Button>
          </Link>
          <Link href="/deuda">
            <Button size="sm" variant="outline">
              Deuda
            </Button>
          </Link>
          <Link href="/nuevo">
            <Button size="sm" variant="outline">
              + Pedido
            </Button>
          </Link>
          <Link href="/configuracion">
            <Button size="sm" variant="outline">
              Config
            </Button>
          </Link>
          <Button
            size="sm"
            variant={soundOn ? 'brand' : 'outline'}
            onClick={() => setSoundOn((s) => !s)}
          >
            {soundOn ? '🔔 Alertas ON' : '🔕 Activar alertas'}
          </Button>
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

      {blocked.on && (
        <p className="mb-3 rounded-xl bg-danger/15 px-3 py-2 text-[14px] text-danger">
          ⛔ Tu cuenta está suspendida{blocked.reason ? ` (${blocked.reason})` : ''}. Ve a{' '}
          <Link href="/deuda" className="underline">
            Deuda
          </Link>{' '}
          o contacta a soporte.
        </p>
      )}
      {pendingCount > 0 && (
        <p className="mb-3 rounded-xl bg-warning/15 px-3 py-2 text-[14px] text-warning">
          {pendingCount} pedido{pendingCount === 1 ? '' : 's'} esperando que aceptes.
        </p>
      )}
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      {active.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-8 text-center text-ink-subtle">
              Sin pedidos activos. Aquí aparecerán al instante.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {active.map((o) => (
            <li key={o.id}>
              <OrderCard
                order={o}
                onTransition={transition}
                onExtend={extendPrep}
                onValidate={validate}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OrderCard({
  order,
  onTransition,
  onExtend,
  onValidate,
}: {
  order: Order
  onTransition: (id: string, action: string, params?: Record<string, unknown>) => Promise<void>
  onExtend: (id: string) => Promise<void>
  onValidate: (id: string, pass: boolean) => Promise<void>
}) {
  const [prep, setPrep] = useState(25)
  const [busy, setBusy] = useState(false)

  const run = async (action: string, params?: Record<string, unknown>) => {
    setBusy(true)
    await onTransition(order.id, action, params)
    setBusy(false)
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[13px] text-ink">#{order.short_id}</p>
            <p className="font-medium text-[15px] text-ink">{order.customer_name ?? 'Cliente'}</p>
            <p className="text-[13px] text-ink-muted">
              {soles(order.order_amount)} ·{' '}
              {PAYMENT_LABEL[order.payment_intent] ?? order.payment_intent} ·{' '}
              {order.delivery_method === 'pickup' ? 'Recojo' : 'Delivery'}
            </p>
            {order.delivery_reference && (
              <p className="mt-1 text-[13px] text-ink-subtle">📍 {order.delivery_reference}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {order.status === 'validando' && (
            <>
              <span className="rounded-lg bg-info/15 px-2 py-1 text-[13px] text-info">
                {order.payment_intent === 'prepaid'
                  ? 'Revisa el comprobante de Yape'
                  : 'Llama al cliente para validar'}
              </span>
              {order.payment_intent === 'prepaid' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const r = await api.get<{ data: { url: string | null } }>(
                        `/business/orders/${order.id}/prepay-proof`,
                      )
                      if (r.data.url) window.open(r.data.url, '_blank')
                    } catch {}
                  }}
                >
                  Ver comprobante
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await onValidate(order.id, true)
                  setBusy(false)
                }}
              >
                {order.payment_intent === 'prepaid' ? 'Aprobar' : 'Validar'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await onValidate(order.id, false)
                  setBusy(false)
                }}
              >
                {order.payment_intent === 'prepaid' ? 'Rechazar' : 'No contesta'}
              </Button>
            </>
          )}
          {order.status === 'pending_acceptance' && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run('accept')}>
                Aceptar
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => run('cancel', { reason: 'business_cancelled' })}
              >
                Rechazar
              </Button>
            </>
          )}
          {order.status === 'confirmed' && (
            <>
              <label className="flex items-center gap-1 text-[13px] text-ink-muted">
                Prep:
                <input
                  type="number"
                  className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-center"
                  value={prep}
                  min={1}
                  max={120}
                  onChange={(e) => setPrep(Number(e.target.value))}
                />
                min
              </label>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run('preparing', { prepTimeMinutes: prep })}
              >
                Empezar a preparar
              </Button>
            </>
          )}
          {order.status === 'preparing' && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run('ready')}>
                Listo para recoger
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await onExtend(order.id)
                  setBusy(false)
                }}
              >
                +10 min
              </Button>
            </>
          )}
          {[
            'waiting_driver',
            'heading_to_restaurant',
            'waiting_at_restaurant',
            'picked_up',
          ].includes(order.status) && (
            <span className="rounded-lg bg-brand-light px-2 py-1 text-[13px] text-brand-dark">
              {order.status === 'waiting_driver' && 'Buscando motorizado…'}
              {order.status === 'heading_to_restaurant' && 'Motorizado en camino'}
              {order.status === 'waiting_at_restaurant' && 'Motorizado en el local'}
              {order.status === 'picked_up' && 'En reparto'}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
