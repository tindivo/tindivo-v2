'use client'

import { Badge, Button, Card, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import { soles } from '@/lib/format'
import { type SettlementOrder, type TodayRow, useCashSummary } from '../hooks/use-cash-summary'
import { useDeliverCash } from '../hooks/use-deliver-cash'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const horaDe = (iso: string | null) => (iso ? horaLima.format(Date.parse(iso)) : null)

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

      <OrderBreakdown orders={row.orders} />

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

/**
 * Los pedidos que componen el importe.
 *
 * POR QUÉ NO VA COLAPSADO. El legacy lo esconde tras un "Ver pedidos (3)"; aquí
 * va abierto. Con ~10 pedidos por noche repartidos entre pocos negocios, la
 * lista cabe, y el momento en que se usa es justo cuando la cajera está contando
 * el fajo delante: un toque de más ahí es un toque que no se da.
 *
 * Cada línea es NOMBRE (o #código) · HORA · IMPORTE. La hora es lo que ordena la
 * conversación cuando algo no cuadra — "el de las 19:40, el de Carmen" — y es lo
 * único de esta lista que el legacy no tiene.
 */
function OrderBreakdown({ orders }: { orders: SettlementOrder[] }) {
  if (orders.length === 0) return null

  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-t border-ink/[0.06] pt-3">
      {orders.map((o) => {
        const hora = horaDe(o.deliveredAt)
        const nombre = o.customerName?.trim()
        return (
          <li key={o.orderId} className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ink">{nombre || `#${o.shortId}`}</span>
              {hora && <span className="ml-1.5 font-mono text-[11px] text-ink-muted">{hora}</span>}
            </span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-ink">
              {soles(o.cashOwed)}
            </span>
          </li>
        )
      })}
      {orders.some((o) => o.breakdown) && <AdvanceNote orders={orders} />}
    </ul>
  )
}

/**
 * La explicación del adelanto, y solo cuando lo hay.
 *
 * Sin esto el motorizado ve "Yape · S/ 8.00" y lo lee como un error del sistema
 * — un pedido que no cobró en efectivo pero por el que se le pide dinero. La
 * respuesta es que ese sencillo se lo dio la caja antes de salir.
 */
function AdvanceNote({ orders }: { orders: SettlementOrder[] }) {
  const total = orders.reduce((s, o) => s + (o.breakdown?.advance ?? 0), 0)
  return (
    <li className="mt-1 flex items-start gap-2 rounded-[12px] bg-warning-soft px-3 py-2 text-[12px] text-amber-900">
      <Icon name="info" size={15} filled className="mt-px shrink-0" />
      <span>
        Incluye <strong className="font-semibold tabular-nums">{soles(total)}</strong> de sencillo
        que te adelantó el local. Ese dinero es suyo, hayas cobrado en efectivo o no.
      </span>
    </li>
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

      {/* El desglose sigue disponible DESPUÉS de entregar: es justo cuando la
          cajera cuenta el fajo y hace falta poder señalar un pedido. */}
      <OrderBreakdown orders={row.orders} />

      <p className="mt-2 text-[12px] text-ink-muted">
        {disputada
          ? 'El local reportó una diferencia. Tindivo lo está revisando.'
          : 'Esperando que el local cuente el efectivo y lo confirme.'}
      </p>
    </Card>
  )
}
