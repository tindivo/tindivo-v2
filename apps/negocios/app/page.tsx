'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { DetailActions, DetailItem } from '@/components/dashboard/pedido-detail'
import { PedidosDesktop, PedidosMobile } from '@/components/dashboard/pedidos-view'
import { api } from '@/lib/api'
import {
  getColumn,
  isBusinessPaused,
  ORDER_SELECT,
  type OrderRow,
  pauseMinutesLeft,
  toOrderVM,
} from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { unlockAudio, useDashboardSounds } from '@/lib/use-audio-alert'

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

interface BizState {
  name: string
  accent: string
  qrUrl: string | null
  until: string | null
  blocked: boolean
  reason: string | null
}

function Board({ onSignOut }: { onSignOut: () => void }) {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [biz, setBiz] = useState<BizState>({
    name: 'Mi negocio',
    accent: '#F472B6',
    qrUrl: null,
    until: null,
    blocked: false,
    reason: null,
  })
  const [soundOn, setSoundOn] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailItems, setDetailItems] = useState<DetailItem[] | null>(null)
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPause, setShowPause] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetchOrders = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data, error: e } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(100)
    if (e) setError(e.message)
    else setRows((data ?? []) as unknown as OrderRow[])
  }, [])

  const refetchBiz = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data } = await supabase
      .from('businesses')
      .select('name,accent_color,qr_url,accepting_orders_until,is_blocked,block_reason')
      .maybeSingle()
    if (data)
      setBiz({
        name: data.name ?? 'Mi negocio',
        accent: data.accent_color ? `#${data.accent_color}` : '#F472B6',
        qrUrl: data.qr_url ?? null,
        until: (data.accepting_orders_until as string | null) ?? null,
        blocked: data.is_blocked ?? false,
        reason: data.block_reason ?? null,
      })
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    refetchBiz()
    refetchOrders()
    const channel = supabase
      .channel('biz-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
        refetchOrders(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () =>
        refetchBiz(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetchOrders, refetchBiz])

  // Tick para countdowns / buffer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Datos derivados del pedido seleccionado (para deps honestas del efecto).
  const selRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const selSource = selRow?.source ?? null
  const selProofPath = selRow?.comprobante_prepago_url ?? null

  // Detalle: carga lazy de items (Online) + comprobante firmado (prepago).
  // Se re-ejecuta si el cliente sube el comprobante con el detalle abierto.
  useEffect(() => {
    let cancel = false
    setDetailItems(null)
    setDetailProofUrl(null)
    if (!selectedId) return
    const supabase = getSupabaseBrowser()
    void (async () => {
      if (selSource === 'customer_pwa') {
        const { data } = await supabase
          .from('customer_order_items')
          .select(
            'item_name_snapshot,quantity,unit_price,line_total,note,customer_order_item_modifiers(option_name_snapshot)',
          )
          .eq('order_id', selectedId)
        if (!cancel)
          setDetailItems(
            (data ?? []).map((r) => {
              const mods = (
                (r.customer_order_item_modifiers ?? []) as { option_name_snapshot: string }[]
              )
                .map((m) => m.option_name_snapshot)
                .join(', ')
              return {
                qty: r.quantity as number,
                name: r.item_name_snapshot as string,
                price: Number(r.line_total ?? (r.unit_price as number) * (r.quantity as number)),
                note: (r.note as string | null) ?? null,
                mods: mods || null,
              }
            }),
          )
      }
      if (selProofPath) {
        try {
          const r = await api.get<{ data: { url: string | null } }>(
            `/business/orders/${selectedId}/prepay-proof`,
          )
          if (!cancel) setDetailProofUrl(r.data.url)
        } catch {
          /* sin comprobante todavía */
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [selectedId, selSource, selProofPath])

  const vms = useMemo(() => rows.map((r) => toOrderVM(r, now)), [rows, now])
  const newOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'nuevos'), [vms])
  const cookingOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'cocina'), [vms])
  const routeOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'reparto'), [vms])
  const history = useMemo(
    () => vms.filter((v) => getColumn(v.status) === 'entregados').slice(0, 40),
    [vms],
  )
  const counts = {
    new: newOrders.length,
    cooking: cookingOrders.length,
    route: routeOrders.length,
    today: vms.filter((v) => v.status === 'delivered').length,
  }
  const selected = selectedId ? (vms.find((v) => v.rowId === selectedId) ?? null) : null
  const paused = isBusinessPaused(biz.until, now)
  const pauseMin = pauseMinutesLeft(biz.until, now)
  const hasWaiting = cookingOrders.some((o) => o.state === 'waiting')
  const hasBufferP3 = cookingOrders.some((o) => o.state === 'buffer_p3')

  useDashboardSounds({ hasPending: counts.new > 0, hasWaiting, hasBufferP3, soundOn })

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }, [])

  const post = (path: string, body: unknown) => api.post(path, body)

  const actions: DetailActions = {
    onClose: () => setSelectedId(null),
    onAccept: (prep) =>
      run(async () => {
        if (!selected) return
        const id = selected.rowId
        if (selected.status === 'validando')
          await post(`/business/orders/${id}/validate`, { pass: true })
        await post(`/business/orders/${id}/transition`, { action: 'accept' })
        await post(`/business/orders/${id}/transition`, {
          action: 'preparing',
          prepTimeMinutes: prep,
        })
        setSelectedId(null)
        await refetchOrders()
      }),
    onReject: (code, text) =>
      run(async () => {
        if (!selected) return
        const id = selected.rowId
        if (selected.status === 'validando')
          await post(`/business/orders/${id}/validate`, {
            pass: false,
            reason: text,
            reasonCode: code,
          })
        else
          await post(`/business/orders/${id}/transition`, {
            action: 'cancel',
            reason: 'business_cancelled',
            reasonCode: code,
            reasonText: text,
          })
        setSelectedId(null)
        await refetchOrders()
      }),
    onVerifyProof: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, { pass: true })
        await refetchOrders()
      }),
    onRejectProof: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, {
          pass: false,
          reason: 'Comprobante inválido',
          reasonCode: 'invalid_proof',
        })
        setSelectedId(null)
        await refetchOrders()
      }),
    onExtend: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/extend-prep`, {})
        await refetchOrders()
      }),
    onReady: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, { action: 'ready' })
        setSelectedId(null)
        await refetchOrders()
      }),
    onCancel: (code, text) =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, {
          action: 'cancel',
          reason: 'business_cancelled',
          reasonCode: code,
          reasonText: text,
        })
        setSelectedId(null)
        await refetchOrders()
      }),
  }

  const onConfirmPause = (min: number | null) =>
    run(async () => {
      await post('/business/pause', { minutes: min })
      setShowPause(false)
      await refetchBiz()
    })
  const onResume = () =>
    run(async () => {
      await api.delete('/business/pause')
      await refetchBiz()
    })

  const toggleSound = () =>
    setSoundOn((s) => {
      if (!s) unlockAudio()
      return !s
    })

  const viewProps = {
    bizName: biz.name,
    accent: biz.accent,
    paused,
    pauseMinLeft: pauseMin,
    soundOn,
    onToggleSound: toggleSound,
    onOpenPause: () => setShowPause(true),
    onResume,
    counts,
    newOrders,
    cookingOrders,
    routeOrders,
    history,
    onOpen: (o: { rowId: string }) => setSelectedId(o.rowId),
    onSignOut: async () => {
      await getSupabaseBrowser().auth.signOut()
      onSignOut()
    },
    selected,
    detailItems,
    detailProofUrl,
    qrUrl: biz.qrUrl,
    detailBusy: busy,
    actions,
    showPauseModal: showPause,
    onClosePause: () => setShowPause(false),
    onConfirmPause,
  }

  return (
    <>
      {(error || biz.blocked) && (
        <div className="fixed top-2 left-1/2 z-[400] -translate-x-1/2 px-2">
          {biz.blocked && (
            <p className="mb-1 rounded-xl bg-danger px-3 py-2 text-center text-[13px] text-white shadow">
              Tu cuenta está suspendida{biz.reason ? ` (${biz.reason})` : ''}.
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-ink px-3 py-2 text-center text-[13px] text-white shadow">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="lg:hidden">
        <PedidosMobile {...viewProps} />
      </div>
      <div className="hidden lg:block">
        <PedidosDesktop {...viewProps} />
      </div>
    </>
  )
}
