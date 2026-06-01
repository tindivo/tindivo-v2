'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)

const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'Por confirmar',
  confirmed: 'Confirmado',
  disputed: 'En disputa',
  resolved: 'Resuelto',
  auto_assumed_confirmed: 'Confirmado (auto)',
}

interface TodayRow {
  businessId: string
  businessName: string
  expected: number
  orderCount: number
  settlementId: string | null
  status: string | null
  deliveredAmount: number | null
}
interface HistoryRow {
  id: string
  settlement_date: string
  status: string
  delivered_amount: number | null
  total_cash: number
  businesses: { name: string } | null
}

export default function EfectivoPage() {
  const router = useRouter()
  const [today, setToday] = useState<TodayRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ today: TodayRow[]; history: HistoryRow[] }>>('/driver/cash-settlements')
      .then((r) => {
        setToday(r.data.today)
        setHistory(r.data.history)
      })
      .catch((e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'))
  }, [])

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

  const pending = today.filter((t) => t.status == null || t.status === 'pending_confirmation')

  return (
    <div className="mx-auto max-w-[768px] px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Entregas
      </Link>
      <h1 className="mt-2 mb-5 font-display font-semibold text-[24px] text-ink">
        Efectivo del turno
      </h1>
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      <h2 className="mb-2 font-display font-semibold text-[16px] text-ink">A entregar hoy</h2>
      {today.length === 0 ? (
        <p className="mb-6 text-[14px] text-ink-subtle">No recolectaste efectivo hoy.</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {today.map((t) => (
            <li key={t.businessId}>
              <CashDeliverCard row={t} onDone={load} setError={setError} />
            </li>
          ))}
        </ul>
      )}

      {pending.length === 0 && today.length > 0 && (
        <p className="mb-6 rounded-xl bg-success/15 px-3 py-2 text-[14px] text-success">
          Todo el efectivo de hoy fue entregado. 🎉
        </p>
      )}

      <h2 className="mb-2 font-display font-semibold text-[16px] text-ink">Historial</h2>
      {history.length === 0 ? (
        <p className="text-[14px] text-ink-subtle">Sin entregas anteriores.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between border-border border-t py-2 text-[14px]"
            >
              <span className="text-ink">
                {h.businesses?.name ?? '—'}{' '}
                <span className="font-mono text-[12px] text-ink-subtle">{h.settlement_date}</span>
              </span>
              <span className="font-mono text-ink-muted">
                {soles(h.delivered_amount)} · {STATUS_LABEL[h.status] ?? h.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CashDeliverCard({
  row,
  onDone,
  setError,
}: {
  row: TodayRow
  onDone: () => void
  setError: (s: string | null) => void
}) {
  const [amount, setAmount] = useState(String(row.expected.toFixed(2)))
  const [busy, setBusy] = useState(false)
  const settled = row.status != null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/driver/cash-settlements', {
        businessId: row.businessId,
        deliveredAmount: Number(amount),
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-[15px] text-ink">{row.businessName}</p>
            <p className="text-[13px] text-ink-muted">
              {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'} · esperado{' '}
              <span className="font-mono">{soles(row.expected)}</span>
            </p>
          </div>
          {settled && (
            <span className="rounded-lg bg-success/15 px-2 py-1 text-[12px] text-success">
              {STATUS_LABEL[row.status as string] ?? row.status}
            </span>
          )}
        </div>
        {!settled && (
          <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[13px] text-ink-muted">
              Entregué S/
              <input
                className="h-10 w-24 rounded-lg border border-border bg-surface px-2 text-center font-mono outline-none focus:border-brand"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              Entregar al negocio
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
