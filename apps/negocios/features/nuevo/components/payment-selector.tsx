'use client'

import { Icon } from '@tindivo/ui'
import { PAYMENTS } from '../lib/constants'
import type { Payment } from '../types'

export function PaymentSelector({
  value,
  onChange,
}: {
  value: Payment
  onChange: (p: Payment) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Método de pago
      </div>
      <div className="flex flex-col gap-2">
        {PAYMENTS.map((o) => {
          const active = value === o.id
          return (
            <button
              type="button"
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all ${
                active ? 'border-ink' : 'border-border hover:bg-surface'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
                  active ? 'bg-ink text-white' : 'bg-surface text-ink'
                }`}
              >
                <Icon name={o.icon} size={20} filled={active} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted">{o.sub}</div>
              </div>
              {active && <Icon name="check_circle" size={20} className="text-brand" filled />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
