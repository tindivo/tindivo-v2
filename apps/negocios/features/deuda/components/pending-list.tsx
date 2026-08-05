'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { soles } from '@/components/dashboard/primitives'
import { fmtDate } from '../lib/format'
import type { PendingGroupItem } from '../types'

const TYPE_FILTERS = [
  { key: 'all' as const, label: 'Todos' },
  { key: 'orders' as const, label: 'Pedidos' },
  { key: 'refunds' as const, label: 'Devoluciones' },
]

export type TypeFilter = (typeof TYPE_FILTERS)[number]['key']

export function PendingList({
  groups,
  typeFilter,
  onTypeFilterChange,
}: {
  groups: PendingGroupItem[]
  typeFilter: TypeFilter
  onTypeFilterChange: (f: TypeFilter) => void
}) {
  const filtered = groups.filter((g) => {
    if (typeFilter === 'all') return true
    if (typeFilter === 'orders') return g.type === 'order'
    if (typeFilter === 'refunds') return g.type === 'refund'
    return true
  })

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="receipt_long" size={20} className="text-ink-muted" />
          <div className="text-[15px] font-bold">Detalle de pendientes</div>
          <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink">
            {groups.length} {groups.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </div>

        <div className="flex gap-1">
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onTypeFilterChange(f.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  active ? 'bg-ink text-white' : 'bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-ink-subtle">
          No hay ítems pendientes en este filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((g) =>
            g.type === 'order' ? (
              <OrderGroupRow key={g.key} group={g} />
            ) : (
              <RefundGroupRow key={g.key} group={g} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function OrderGroupRow({ group }: { group: PendingGroupItem }) {
  const breakdown = group.charges
    .map((c) =>
      c.chargeType === 'delivery_fee'
        ? `Delivery Fee ${soles(c.amount)}`
        : `Comisión ${soles(c.amount)}`,
    )
    .join(' + ')

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
      <div className="text-base">🛵</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {group.shortId && (
            <span className="font-mono text-[13px] font-bold text-brand">#{group.shortId}</span>
          )}
          <span className="text-[11px] text-ink-subtle">· {fmtDate(group.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">{breakdown}</div>
      </div>
      <div className="font-mono text-[14px] font-bold text-ink">{soles(group.totalAmount)}</div>
    </div>
  )
}

function RefundGroupRow({ group }: { group: PendingGroupItem }) {
  const charge = group.charges[0]

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
      <div className="text-base">↩️</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Devolución al cliente</span>
          {group.shortId && (
            <span className="font-mono text-[11px] font-bold text-brand">#{group.shortId}</span>
          )}
          <span className="text-[11px] text-ink-subtle">· {fmtDate(group.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">
          {charge?.description || 'Devolución por apelación / cancelación'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {charge && (
          <Link
            href={`/deuda/devoluciones/${charge.reportId || charge.id}`}
            className="inline-flex items-center rounded-lg bg-surface px-2 py-1 text-[11px] font-semibold text-ink no-underline transition-colors hover:bg-surface-low"
          >
            Ver detalle
          </Link>
        )}
        <div className="font-mono text-[14px] font-bold text-danger">
          {soles(group.totalAmount)}
        </div>
      </div>
    </div>
  )
}
