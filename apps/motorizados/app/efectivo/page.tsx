'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { Badge, Button, Card, cn, EmptyState } from '@tindivo/ui'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { DriverShell } from '@/components/driver-shell'
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
  /**
   * `pending`  — efectivo cobrado que todavía llevas encima. Se puede entregar.
   * `awaiting` — ya lo entregaste; falta que el local lo confirme. Informativo.
   * Un mismo negocio puede salir en los dos a la vez.
   */
  kind: 'pending' | 'awaiting'
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
        if (!data.session) return
        load()
        setReady(true)
      })
  }, [load])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  const porEntregar = today.filter((t) => t.kind === 'pending')
  const esperandoConfirmar = today.filter((t) => t.kind === 'awaiting')
  const totalPorEntregar = porEntregar.reduce((s, t) => s + t.expected, 0)
  const totalPedidos = porEntregar.reduce((s, t) => s + t.orderCount, 0)

  return (
    <DriverShell>
      <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
        <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
          <h1 className="font-display text-[24px] font-bold tracking-tight">Efectivo</h1>
        </div>
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        {/* Total que el motorizado lleva encima ahora mismo. Es el número que
            tiene que cuadrar con el fajo de su bolsillo. */}
        {porEntregar.length > 0 && (
          <Card className="mt-4 border-none bg-brand p-5 text-white shadow-none">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              Efectivo por entregar
            </p>
            <p className="font-display mt-1 text-[38px] font-bold leading-none tracking-tight tabular-nums">
              {soles(totalPorEntregar)}
            </p>
            <p className="mt-2 text-[12px] text-white/85">
              {totalPedidos} {totalPedidos === 1 ? 'pedido' : 'pedidos'} · {porEntregar.length}{' '}
              {porEntregar.length === 1 ? 'restaurante' : 'restaurantes'}
            </p>
          </Card>
        )}

        <h2 className="font-mono mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          A entregar
        </h2>
        {porEntregar.length === 0 ? (
          <EmptyState
            icon="payments"
            heading="Sin efectivo por entregar"
            description={
              esperandoConfirmar.length > 0
                ? 'Ya entregaste todo el efectivo que tenías.'
                : 'Cuando cobres en efectivo aparecerá aquí.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {porEntregar.map((t) => (
              <CashDeliverCard key={t.businessId} row={t} onDone={load} setError={setError} />
            ))}
          </div>
        )}

        {esperandoConfirmar.length > 0 && (
          <>
            <h2 className="font-mono mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Esperando confirmación del local
            </h2>
            <div className="flex flex-col gap-2.5">
              {esperandoConfirmar.map((t) => (
                <AwaitingCard key={t.settlementId} row={t} />
              ))}
            </div>
          </>
        )}

        <h2 className="font-mono mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          Historial
        </h2>
        {history.length === 0 ? (
          <EmptyState
            icon="history"
            heading="Sin entregas anteriores"
            description="Aquí verás las entregas de efectivo que ya hiciste."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            {history.map((h, i) => {
              const chip = STATUS_VARIANT[h.status]
              return (
                <div
                  key={h.id}
                  className={cn(
                    'flex items-center justify-between px-4 py-3',
                    i > 0 && 'border-t border-ink/[0.06]',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{h.businesses?.name ?? '—'}</p>
                    <p className="font-mono text-[11px] text-ink-subtle">{h.settlement_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[14px] font-semibold tabular-nums">
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
      </main>
    </DriverShell>
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
      </div>

      <p className="font-display mt-2 text-[24px] font-bold tracking-tight tabular-nums">
        {soles(row.expected)}
      </p>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <span className="rounded-2xl border border-border bg-card px-3 py-3.5 font-mono text-[15px] text-ink-muted">
          S/
        </span>
        <input
          className="w-full flex-1 rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-center font-mono text-base font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/8"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button size="md" disabled={busy}>
          {busy ? '…' : 'Entregar'}
        </Button>
      </form>
    </Card>
  )
}

/** Dinero ya entregado al local, a la espera de que lo cuenten y lo confirmen.
 *  Sin acción: el motorizado ya hizo su parte. */
function AwaitingCard({ row }: { row: TodayRow }) {
  const disputada = row.status === 'disputed'
  return (
    <Card className="p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[16px]">{row.businessName}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'} entregados
          </p>
        </div>
        <Badge variant={disputada ? 'danger' : 'warning'} size="sm">
          {disputada ? 'Diferencia' : 'Por confirmar'}
        </Badge>
      </div>

      <p className="font-display mt-2 text-[24px] font-bold tracking-tight tabular-nums">
        {soles(row.deliveredAmount ?? 0)}
      </p>

      <p className="mt-2 text-[12px] text-ink-muted">
        {disputada
          ? 'El local reportó una diferencia. Tindivo lo está revisando.'
          : 'Esperando que el local cuente el efectivo y lo confirme.'}
      </p>
    </Card>
  )
}
