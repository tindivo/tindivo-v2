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
      {/* Cabecera y filtros responsive */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon name="receipt_long" size={18} className="text-brand" />
          <h3 className="text-body font-bold text-ink">Detalle de pendientes</h3>
          <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
            {groups.length} {groups.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onTypeFilterChange(f.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-ink text-white shadow-elev-1 font-bold'
                    : 'bg-card border border-border text-ink-muted hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
          <Icon name="check_circle" size={28} filled className="mx-auto text-emerald-500 mb-2" />
          <p className="text-body font-bold text-ink">Sin cargos pendientes</p>
          <p className="mt-1 text-caption text-ink-muted">
            {typeFilter === 'all'
              ? 'No tienes comisiones ni devoluciones pendientes de liquidar.'
              : 'No hay registros en este filtro.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-elev-1 transition-all">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
        <Icon name="two_wheeler" size={18} filled />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {group.shortId && (
            <span className="font-mono text-[13px] font-bold text-brand">#{group.shortId}</span>
          )}
          <span className="text-[11px] text-ink-subtle">· {fmtDate(group.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted truncate">{breakdown}</div>
      </div>
      <div className="shrink-0 font-mono text-[14px] font-bold text-ink">
        {soles(group.totalAmount)}
      </div>
    </div>
  )
}

function RefundGroupRow({ group }: { group: PendingGroupItem }) {
  const charge = group.charges[0]

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-danger/15 bg-card p-3 shadow-elev-1 transition-all">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <Icon name="replay" size={18} filled />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold text-ink">Devolución</span>
          {group.shortId && (
            <span className="font-mono text-[11px] font-bold text-danger">#{group.shortId}</span>
          )}
          <span className="text-[11px] text-ink-subtle">· {fmtDate(group.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted truncate">
          {charge?.description || 'Devolución por apelación / cancelación'}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {charge && (
          <Link
            href={`/deuda/devoluciones/${charge.reportId || charge.id}`}
            className="inline-flex items-center rounded-lg bg-surface border border-border px-2 py-1 text-[10px] font-bold text-ink no-underline transition-colors hover:bg-surface-low"
          >
            Detalle
          </Link>
        )}
        <div className="font-mono text-[14px] font-bold text-danger">
          {soles(group.totalAmount)}
        </div>
      </div>
    </div>
  )
}
