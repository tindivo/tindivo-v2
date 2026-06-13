'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { soles } from '@/lib/format'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  pending_confirmation: {
    label: 'Por confirmar',
    bg: 'rgba(245,158,11,0.15)',
    color: '#92400E',
  },
  confirmed: { label: 'Confirmado', bg: 'rgba(22,163,74,0.1)', color: '#16a34a' },
  auto_assumed_confirmed: {
    label: 'Confirmado (auto)',
    bg: 'rgba(22,163,74,0.1)',
    color: '#16a34a',
  },
  disputed: { label: 'En disputa', bg: 'rgba(220,38,38,0.1)', color: '#DC2626' },
  resolved: { label: 'Resuelto', bg: 'rgba(26,22,20,0.06)', color: '#57534E' },
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
    <main className="mx-auto min-h-dvh max-w-[480px] bg-surface pb-10">
      <ScreenHeader title="Efectivo del turno" onBack={() => router.push('/')} />

      <div className="px-4">
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <h2 className="t-eyebrow mt-4 mb-2" style={{ marginBottom: 8 }}>
          A entregar hoy
        </h2>
        {today.length === 0 ? (
          <p className="t-muted text-[14px]">No recolectaste efectivo hoy.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {today.map((t) => (
              <CashDeliverCard key={t.businessId} row={t} onDone={load} setError={setError} />
            ))}
          </div>
        )}

        {pending.length === 0 && today.length > 0 && (
          <div className="mt-3 rounded-[18px] bg-success/10 px-4 py-3 font-semibold text-[14px] text-success">
            Todo el efectivo de hoy fue entregado 🎉
          </div>
        )}

        <h2 className="t-eyebrow mt-6" style={{ marginBottom: 8 }}>
          Historial
        </h2>
        {history.length === 0 ? (
          <p className="t-muted text-[14px]">Sin entregas anteriores.</p>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-ink/5 bg-white">
            {history.map((h, i) => {
              const chip = STATUS_CHIP[h.status]
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderTop: i > 0 ? '1px solid rgba(26,22,20,0.06)' : 'none',
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[14px]">{h.businesses?.name ?? '—'}</p>
                    <p className="font-mono text-[11px] text-ink-subtle">{h.settlement_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[14px] tabular-nums">
                      {soles(h.delivered_amount)}
                    </p>
                    <p className="text-[11px]" style={{ color: chip?.color ?? '#57534E' }}>
                      {chip?.label ?? h.status}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
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
  const chip = settled ? STATUS_CHIP[row.status as string] : null

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
    <div className="rounded-[22px] border border-ink/5 bg-white p-[18px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-[16px]">{row.businessName}</p>
          <p className="mt-0.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'} en efectivo
          </p>
        </div>
        {chip && (
          <span
            className="rounded-md px-2 py-1 font-bold font-mono text-[10px] uppercase"
            style={{ letterSpacing: '0.08em', background: chip.bg, color: chip.color }}
          >
            {chip.label}
          </span>
        )}
      </div>

      <p className="t-display mt-2 text-[24px] tabular-nums">{soles(row.expected)}</p>

      {!settled && (
        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <span
            className="rounded-2xl border border-border bg-white px-3 py-3 font-mono text-[15px]"
            style={{ color: 'rgba(26,22,20,0.6)' }}
          >
            S/
          </span>
          <input
            className="t-field text-center font-mono"
            style={{ flex: 1 }}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="submit"
            className="t-btn t-btn-primary"
            style={{ padding: '12px 20px', fontSize: 14 }}
            disabled={busy}
          >
            {busy ? '…' : 'Entregar'}
          </button>
        </form>
      )}
    </div>
  )
}
