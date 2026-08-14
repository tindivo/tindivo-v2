'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, fieldSm, Ico, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface DisputedOrder {
  id: string
  short_id: string
  customer_name: string | null
  delivered_at: string | null
}

interface CashDisputeRow {
  id: string
  settlement_date: string
  total_cash: number
  delivered_amount: number | null
  reported_amount: number | null
  status: string
  dispute_note: string | null
  businesses: { name: string } | null
  drivers: { full_name: string } | null
  /** Desde 0157 la disputa es de UN cliente. Las filas viejas traen varios. */
  orders: DisputedOrder[] | null
}

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

/**
 * De quién es la disputa.
 *
 * Es la línea que faltaba. La entrega de efectivo pasó a ser por cliente
 * justamente para que una diferencia se pueda atribuir a alguien, y el admin
 * —el único que puede resolverla— era el único que no veía el nombre.
 */
function DeQuien({ orders }: { orders: DisputedOrder[] | null }) {
  const list = orders ?? []
  if (list.length === 0) return null

  if (list.length === 1) {
    const o = list[0]
    if (!o) return null
    const hora = o.delivered_at ? horaLima.format(Date.parse(o.delivered_at)) : null
    return (
      <p className="mt-1 text-[14px] font-medium text-ink">
        {o.customer_name?.trim() || `#${o.short_id}`}
        {hora && <span className="ml-1.5 font-mono text-[12px] text-ink-muted">{hora}</span>}
      </p>
    )
  }

  // Fila anterior a 0157: la liquidación cubría varios pedidos de golpe y la
  // diferencia no se puede atribuir a ninguno. Se listan todos.
  return (
    <p className="mt-1 text-[14px] text-ink">
      {list.length} pedidos ·{' '}
      <span className="text-ink-muted">
        {list.map((o) => o.customer_name?.trim() || `#${o.short_id}`).join(', ')}
      </span>
    </p>
  )
}

export default function EfectivoPage() {
  const [rows, setRows] = useState<CashDisputeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<CashDisputeRow[]>>('/admin/cash-settlements?status=disputed')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function resolve(row: CashDisputeRow) {
    const note = (notes[row.id] ?? '').trim()
    const amount = Number(amounts[row.id] ?? row.reported_amount ?? row.delivered_amount ?? 0)
    if (!note) {
      setError('La nota de resolución es obligatoria.')
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await api.post(`/admin/cash-settlements/${row.id}/resolve`, { resolvedAmount: amount, note })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Conciliación"
        title="Efectivo"
        description={
          rows ? `${rows.length} disputas de efectivo abiertas` : 'Disputas de cuadre de efectivo.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : rows.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.cash className="h-5 w-5" />}
            title="Sin disputas"
            hint="Todos los cuadres de efectivo están conciliados. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="t-card">
              <p className="text-[13px] text-ink-muted">
                {r.businesses?.name ?? '—'} ↔ {r.drivers?.full_name ?? 'Motorizado'} ·{' '}
                {r.settlement_date}
              </p>

              <DeQuien orders={r.orders} />

              {/* Los dos números que de verdad se contradicen. `total_cash` se
                  omite cuando coincide con lo declarado, que desde 0157 es
                  SIEMPRE: ambos salen de `order_cash_owed` del mismo pedido, y
                  repetir la cifra empujaba el ojo hacia lo que no discrepa. */}
              <p className="mt-1.5 text-[14px]">
                <span className="text-ink-muted">Entregó</span>{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {soles(r.delivered_amount)}
                </span>
                <span className="mx-2 text-ink-subtle">·</span>
                <span className="text-ink-muted">Contaron</span>{' '}
                <span className="font-mono font-semibold tabular-nums text-danger">
                  {soles(r.reported_amount)}
                </span>
                {Number(r.total_cash) !== Number(r.delivered_amount ?? 0) && (
                  <span className="ml-2 text-[13px] text-ink-subtle">
                    (el sistema esperaba {soles(r.total_cash)})
                  </span>
                )}
              </p>
              {r.dispute_note && (
                <p className="mt-1 text-[13px] text-ink-subtle">“{r.dispute_note}”</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  Resolver S/
                  <input
                    className={`${fieldSm} w-24 text-center font-mono`}
                    inputMode="decimal"
                    placeholder={String(r.reported_amount ?? r.delivered_amount ?? '')}
                    value={amounts[r.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                  />
                </label>
                <input
                  className={`${fieldSm} flex-1`}
                  placeholder="Nota de resolución (obligatoria)"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <Button size="sm" disabled={busyId === r.id} onClick={() => resolve(r)}>
                  Resolver
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
