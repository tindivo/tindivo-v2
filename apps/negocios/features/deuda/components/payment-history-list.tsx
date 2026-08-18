'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { fmtDate } from '../lib/format'
import type { PaymentHistoryItem } from '../types'

export function PaymentHistoryList({ items }: { items: PaymentHistoryItem[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon name="history" size={18} className="text-brand" />
        <h3 className="text-body font-bold text-ink">Pagos confirmados</h3>
        <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
          {items.length} {items.length === 1 ? 'pago' : 'pagos'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
          <Icon name="history" size={28} className="mx-auto text-ink-subtle mb-2" />
          <p className="text-body font-bold text-ink">Sin pagos registrados</p>
          <p className="mt-1 text-caption text-ink-muted">
            Los pagos que realices a Tindivo para liquidar tu deuda aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-elev-1 transition-all"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                <Icon name="check_circle" size={18} filled />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-success-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-success">
                    {p.paymentMethod}
                  </span>
                  <span className="text-caption text-ink-subtle">· {fmtDate(p.paidAt)}</span>
                </div>
                <div className="mt-0.5 text-caption text-ink-muted truncate">
                  Saldó {p.settledChargeCount} cargos ({p.orderCount} pedidos)
                  {p.note && ` · ${p.note}`}
                </div>
              </div>

              <div className="shrink-0 font-mono text-body-lg font-bold text-success">
                {soles(p.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
