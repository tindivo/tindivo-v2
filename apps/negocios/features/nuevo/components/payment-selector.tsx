'use client'

import { cn, Icon } from '@tindivo/ui'
import { PAYMENTS } from '../lib/constants'
import type { Payment } from '../types'

export function PaymentSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: Payment
  onChange: (p: Payment) => void
  disabled?: boolean
}) {
  return (
    <div
      data-testid="payment-selector"
      className={cn(
        'rounded-2xl border border-border bg-card p-4 transition-all',
        disabled && 'opacity-60 pointer-events-none',
      )}
    >
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Método de pago
      </div>
      <div className="flex flex-col gap-2">
        {PAYMENTS.map((o) => {
          const active = !disabled && value === o.id
          return (
            <button
              type="button"
              key={o.id}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98]',
                disabled
                  ? 'border-dashed border-border bg-ink/[0.04] cursor-not-allowed opacity-60'
                  : active
                    ? 'border-brand/45 bg-brand-soft shadow-[0_8px_22px_-8px_rgba(249,115,22,0.3)]'
                    : 'border-border bg-card hover:bg-surface',
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white transition-opacity',
                  o.tile,
                  (!active || disabled) && 'opacity-55',
                )}
              >
                <Icon name={o.icon} size={20} filled />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted">{o.sub}</div>
              </div>
              {active && (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white">
                  <Icon name="check" size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
