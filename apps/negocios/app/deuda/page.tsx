'use client'

import { ApiError } from '@tindivo/api-client'
import { Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)
const DISPUTE_WINDOW_MS = 48 * 3600 * 1000

const ADVANCE_STATUS: Record<string, { label: string; cls: string }> = {
  activo: { label: 'Activo', cls: 'bg-warning/15 text-warning' },
  disputado: { label: 'En disputa', cls: 'bg-info/15 text-info' },
  cancelado: { label: 'Anulado', cls: 'bg-success/15 text-success' },
}

interface Advance {
  id: string
  amount: number
  reason: string
  actor_charged: string
  status: string
  created_at: string
  orders: { short_id: string } | null
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Por pagar', cls: 'bg-warning/15 text-warning' },
  paid: { label: 'Pagado', cls: 'bg-success/15 text-success' },
  overdue: { label: 'Vencido', cls: 'bg-danger/15 text-danger' },
  cancelled: { label: 'Cancelado', cls: 'bg-card text-ink-muted' },
}

interface Settlement {
  id: string
  period_start: string
  period_end: string
  order_count: number
  total_amount: number
  status: string
  due_date: string
  paid_at: string | null
}

export default function DeudaPage() {
  const router = useRouter()
  const [balance, setBalance] = useState<number>(0)
  const [blocked, setBlocked] = useState(false)
  const [yape, setYape] = useState<string | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [advances, setAdvances] = useState<Advance[]>([])
  const [disputeId, setDisputeId] = useState<string | null>(null)
  const [disputeNote, setDisputeNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const [{ data: biz }, { data: stl }, { data: adv }, { data: cfg }] = await Promise.all([
      supabase.from('businesses').select('balance_due,is_blocked,blocked_for_debt').maybeSingle(),
      supabase
        .from('settlements')
        .select('id,period_start,period_end,order_count,total_amount,status,due_date,paid_at')
        .order('period_end', { ascending: false })
        .limit(50),
      supabase
        .from('contingency_advances')
        .select('id,amount,reason,actor_charged,status,created_at,orders(short_id)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('app_settings').select('value').eq('key', 'support_whatsapp').maybeSingle(),
    ])
    if (biz) {
      setBalance(Number(biz.balance_due))
      setBlocked(biz.is_blocked)
    }
    setSettlements((stl ?? []) as Settlement[])
    setAdvances((adv ?? []) as Advance[])
    if (cfg?.value) setYape(String(cfg.value).replace(/"/g, ''))
  }, [])

  async function dispute(id: string) {
    const note = disputeNote.trim()
    if (note.length < 5) {
      setErr('Explica brevemente por qué disputas (mín. 5 caracteres).')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api.post(`/business/contingency/${id}/dispute`, { note })
      setDisputeId(null)
      setDisputeNote('')
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo disputar')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace('/')
          return
        }
        load()
        setReady(true)
      })
  }, [router, load])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Pedidos
      </Link>
      <h1 className="mt-2 mb-5 font-display font-semibold text-[24px] text-ink">
        Mi deuda con Tindivo
      </h1>

      {blocked && (
        <p className="mb-4 rounded-xl bg-danger/15 px-3 py-2 text-[14px] text-danger">
          ⛔ Tu cuenta está suspendida por deuda. Regulariza para reactivarla.
        </p>
      )}

      <Card>
        <CardBody>
          <p className="font-mono text-[11px] text-ink-subtle uppercase tracking-wide">
            Deuda actual
          </p>
          <p className="mt-1 font-display font-semibold text-[34px] text-ink">{soles(balance)}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Comisión acumulada de pedidos entregados, pendiente de liquidar.
          </p>
        </CardBody>
      </Card>

      <Card className="mt-3">
        <CardBody>
          <p className="text-[14px] text-ink">
            <span className="font-medium">Cómo pagar:</span> coordina por WhatsApp el pago semanal a
            Tindivo {yape && <>(Yape {yape})</>}.
          </p>
        </CardBody>
      </Card>

      {advances.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 font-display font-semibold text-[16px] text-ink">
            Adelantos del fondo
          </h2>
          {err && <p className="mb-2 text-danger text-sm">{err}</p>}
          <ul className="space-y-2">
            {advances.map((a) => {
              const st = ADVANCE_STATUS[a.status] ?? {
                label: a.status,
                cls: 'bg-card text-ink-muted',
              }
              const canDispute =
                a.actor_charged === 'restaurante' &&
                a.status === 'activo' &&
                Date.now() - new Date(a.created_at).getTime() < DISPUTE_WINDOW_MS
              return (
                <li key={a.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-[15px] text-ink">
                          {soles(a.amount)}
                        </span>
                        {a.orders?.short_id && (
                          <span className="font-mono text-[12px] text-ink-muted">
                            #{a.orders.short_id}
                          </span>
                        )}
                        <span className={`rounded-lg px-2 py-0.5 text-[12px] ${st.cls}`}>
                          {st.label}
                        </span>
                      </p>
                      <p className="mt-1 text-[13px] text-ink-muted">{a.reason}</p>
                    </div>
                    {canDispute && disputeId !== a.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setDisputeId(a.id)
                          setDisputeNote('')
                          setErr(null)
                        }}
                        className="shrink-0 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 font-semibold text-[13px] text-danger"
                      >
                        Disputar
                      </button>
                    )}
                  </div>
                  {disputeId === a.id && (
                    <div className="mt-3">
                      <textarea
                        className="h-20 w-full rounded-xl border border-border bg-surface p-2 text-[14px] outline-none focus:border-brand"
                        placeholder="¿Por qué no corresponde este adelanto?"
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => dispute(a.id)}
                          className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-[13px] text-white disabled:opacity-50"
                        >
                          {busy ? 'Enviando…' : 'Enviar disputa'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisputeId(null)}
                          className="rounded-lg bg-card px-3 py-1.5 text-[13px] text-ink-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {!canDispute && a.status === 'activo' && a.actor_charged === 'restaurante' && (
                    <p className="mt-1 text-[12px] text-ink-subtle">
                      Ventana de disputa (48 h) vencida.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <h2 className="mt-6 mb-2 font-display font-semibold text-[16px] text-ink">
        Historial de liquidaciones
      </h2>
      {settlements.length === 0 ? (
        <p className="text-[14px] text-ink-subtle">Aún no hay liquidaciones generadas.</p>
      ) : (
        <ul className="space-y-2">
          {settlements.map((s) => {
            const st = STATUS_LABEL[s.status] ?? { label: s.status, cls: 'bg-card text-ink-muted' }
            return (
              <li
                key={s.id}
                className="flex items-center justify-between border-border border-t py-2 text-[14px]"
              >
                <span className="font-mono text-[12px] text-ink-muted">
                  {s.period_start} → {s.period_end} · {s.order_count} ped.
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-ink">{soles(s.total_amount)}</span>
                  <span className={`rounded-lg px-2 py-0.5 text-[12px] ${st.cls}`}>{st.label}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
