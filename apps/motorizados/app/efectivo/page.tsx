'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { Badge, Button, Card, ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { soles } from '@/lib/format'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const STATUS_VARIANT: Record<
  string,
  { label: string; variant: 'warning' | 'success' | 'danger' | 'default' }
> = {
  pending_confirmation: { label: 'Por confirmar', variant: 'warning' },
  confirmed: { label: 'Confirmado', variant: 'success' },
  auto_assumed_confirmed: { label: 'Confirmado (auto)', variant: 'success' },
  disputed: { label: 'En disputa', variant: 'danger' },
  resolved: { label: 'Resuelto', variant: 'default' },
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

        <h2 className="t-eyebrow mt-4 mb-2">A entregar hoy</h2>
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
          <Card className="mt-3 border-none bg-success-soft p-4 text-success shadow-none">
            <p className="font-semibold text-[14px]">Todo el efectivo de hoy fue entregado 🎉</p>
          </Card>
        )}

        <h2 className="t-eyebrow mt-6 mb-2">Historial</h2>
        {history.length === 0 ? (
          <p className="t-muted text-[14px]">Sin entregas anteriores.</p>
        ) : (
          <Card className="overflow-hidden p-0">
            {history.map((h, i) => {
              const chip = STATUS_VARIANT[h.status]
              return (
                <div
                  key={h.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i > 0 ? 'border-t border-ink/[0.06]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{h.businesses?.name ?? '—'}</p>
                    <p className="font-mono text-[11px] text-ink-subtle">{h.settlement_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-semibold tabular-nums">
                      {soles(h.delivered_amount)}
                    </p>
                    <Badge variant={chip?.variant ?? 'default'} size="sm" className="mt-0.5">
                      {chip?.label ?? h.status}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </Card>
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
  const chip = settled ? STATUS_VARIANT[row.status as string] : null

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
    <Card className="p-[18px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-[16px]">{row.businessName}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'} en efectivo
          </p>
        </div>
        {chip && (
          <Badge variant={chip.variant} size="sm">
            {chip.label}
          </Badge>
        )}
      </div>

      <p className="t-display mt-2 text-[24px] tabular-nums">{soles(row.expected)}</p>

      {!settled && (
        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <span className="rounded-2xl border border-border bg-card px-3 py-3 font-mono text-[15px] text-ink-muted">
            S/
          </span>
          <input
            className="t-field flex-1 text-center font-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button size="sm" className="px-5" disabled={busy}>
            {busy ? '…' : 'Entregar'}
          </Button>
        </form>
      )}
    </Card>
  )
}
