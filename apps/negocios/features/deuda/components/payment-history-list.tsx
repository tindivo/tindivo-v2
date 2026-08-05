'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { fmtDate } from '../lib/format'
import type { PaymentHistoryItem } from '../types'

export function PaymentHistoryList({ items }: { items: PaymentHistoryItem[] }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name="history" size={20} className="text-ink-muted" />
        <div className="text-[15px] font-bold">Pagos confirmados</div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-ink-subtle">
          Aún no hay pagos registrados en tu historial.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                    {p.paymentMethod}
                  </span>
                  <span className="text-xs text-ink-muted">{fmtDate(p.paidAt)}</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-muted">
                  Saldó {p.settledChargeCount} cargos ({p.orderCount} pedidos)
                  {p.note && ` · ${p.note}`}
                </div>
              </div>

              <div className="font-mono text-[14px] font-bold text-success">{soles(p.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
