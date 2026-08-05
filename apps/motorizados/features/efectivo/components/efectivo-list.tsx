'use client'

import { Badge, Button, Card, EmptyState, SkeletonList } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import { soles } from '@/lib/format'
import { type TodayRow, useCashSummary } from '../hooks/use-cash-summary'
import { useDeliverCash } from '../hooks/use-deliver-cash'

export function EfectivoList() {
  const { today, loading, error, reload } = useCashSummary()
  const { deliver, busy } = useDeliverCash()

  if (loading) {
    return <SkeletonList count={2} />
  }

  const porEntregar = today.filter((t) => t.kind === 'pending')
  const esperandoConfirmar = today.filter((t) => t.kind === 'awaiting')
  const totalPorEntregar = porEntregar.reduce((s, t) => s + t.expected, 0)
  const totalPedidos = porEntregar.reduce((s, t) => s + t.orderCount, 0)

  return (
    <>
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
            <CashDeliverCard
              key={t.businessId}
              row={t}
              onDone={reload}
              deliver={deliver}
              busy={busy}
            />
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
    </>
  )
}

function CashDeliverCard({
  row,
  onDone,
  deliver,
  busy,
}: {
  row: TodayRow
  onDone: () => void
  deliver: (businessId: string, deliveredAmount: number) => Promise<void>
  busy: boolean
}) {
  const [amount, setAmount] = useState(String(row.expected.toFixed(2)))
  const [localError, setLocalError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    try {
      await deliver(row.businessId, Number(amount))
      onDone()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Error')
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

      {localError && <p className="mt-2 text-[13px] text-danger">{localError}</p>}
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
