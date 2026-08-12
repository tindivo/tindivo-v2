'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { num } from '../lib/format'
import type { Payment } from '../types'

export function AmountForm({
  payment,
  amount,
  onAmountChange,
  walletPart,
  onWalletChange,
  cashPart,
  onCashChange,
  paysWith,
  onPaysWithChange,
  mixedOk,
  change,
  disabled = false,
}: {
  payment: Payment
  amount: string
  onAmountChange: (v: string) => void
  walletPart: string
  onWalletChange: (v: string) => void
  cashPart: string
  onCashChange: (v: string) => void
  paysWith: string
  onPaysWithChange: (v: string) => void
  mixedOk: boolean
  change: number
  disabled?: boolean
}) {
  const isCashish = payment === 'pending_cash' || payment === 'pending_mixed'
  const amountN = num(amount)

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 transition-all ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Monto del pedido
      </div>
      <p className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Total a cobrar · delivery + comida (S/)
      </p>
      <input
        disabled={disabled}
        className={`h-11 w-full rounded-xl border px-3 font-mono text-xl font-bold outline-none transition-all ${
          disabled
            ? 'border-dashed border-border bg-ink/[0.04] text-ink-muted cursor-not-allowed'
            : 'border-border bg-card text-ink focus:border-brand'
        }`}
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder={disabled ? 'Primero ingresa el teléfono' : '0.00'}
        inputMode="decimal"
      />
      <p className="mt-1 text-xs text-ink-muted">
        El mismo número que le dijiste al cliente. Es lo que va a cobrar el motorizado.
      </p>

      {!disabled && payment === 'prepaid' && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-sky-100 p-3 text-[13px] text-sky-800">
          <Icon name="verified" size={18} filled />
          El cliente ya pagó — el motorizado solo entrega, no cobra.
        </div>
      )}

      {!disabled && payment === 'pending_mixed' && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <p className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Billetera (S/)
            </p>
            <input
              className="h-11 w-full rounded-xl border border-border bg-card px-3 font-mono text-[15px] text-ink outline-none focus:border-brand"
              value={walletPart}
              onChange={(e) => onWalletChange(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <p className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Efectivo (S/)
            </p>
            <input
              className="h-11 w-full rounded-xl border border-border bg-card px-3 font-mono text-[15px] text-ink outline-none focus:border-brand"
              value={cashPart}
              onChange={(e) => onCashChange(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div
            className={`col-span-2 flex items-center gap-1.5 text-xs ${
              mixedOk ? 'text-success' : 'text-danger'
            }`}
          >
            <Icon name={mixedOk ? 'check_circle' : 'error'} size={14} filled />
            {mixedOk
              ? `${soles(num(walletPart))} + ${soles(num(cashPart))} = ${soles(amountN)} · suma correcta`
              : 'La suma de billetera + efectivo debe igualar el total'}
          </div>
        </div>
      )}

      {!disabled && isCashish && (
        <div className="mt-3">
          <p className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Cliente paga con (S/)
          </p>
          <input
            className="h-11 w-full rounded-xl border border-border bg-card px-3 font-mono text-xl font-bold text-ink outline-none focus:border-brand"
            value={paysWith}
            onChange={(e) => onPaysWithChange(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>
      )}

      {!disabled && isCashish && change > 0 && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-success-soft p-3 text-sm text-green-900">
          <Icon name="payments" size={20} filled className="mt-0.5 shrink-0" />
          <p className="font-semibold">
            Entrega <span className="font-mono">{soles(change)}</span> de vuelto al motorizado junto
            con el pedido
          </p>
        </div>
      )}
    </div>
  )
}
