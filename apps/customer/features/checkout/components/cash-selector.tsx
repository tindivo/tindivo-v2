import { soles } from '@/features/checkout/lib/format'
import { CASH_CHIPS, type CashChoice } from '@/features/checkout/types'

interface CashSelectorProps {
  total: number
  cashChoice: CashChoice
  setCashChoice: (v: CashChoice) => void
  cashCustom: string
  setCashCustom: (v: string) => void
  cashAmount: number
  cashChange: number
}

export function CashSelector({
  total,
  cashChoice,
  setCashChoice,
  cashCustom,
  setCashCustom,
  cashAmount,
  cashChange,
}: CashSelectorProps) {
  return (
    <div className="t-card mt-3 p-4">
      <div className="font-semibold text-[15px] text-ink">¿Con cuánto pagarás?</div>
      <p className="mt-0.5 text-[12px] text-ink-muted">Así el motorizado lleva tu vuelto exacto.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CASH_CHIPS.filter((c) => c.amount === null || c.amount >= total).map((c) => {
          const sel = cashChoice === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCashChoice(c.value)}
              className={`rounded-full px-3.5 py-2 font-semibold text-[13px] transition-colors ${
                sel
                  ? 'bg-brand text-white'
                  : 'border border-ink/[0.08] bg-surface-low text-ink hover:bg-ink/[0.06]'
              }`}
            >
              {c.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCashChoice('custom')}
          className={`rounded-full px-3.5 py-2 font-semibold text-[13px] transition-colors ${
            cashChoice === 'custom'
              ? 'bg-brand text-white'
              : 'border border-ink/[0.08] bg-surface-low text-ink hover:bg-ink/[0.06]'
          }`}
        >
          Otro monto
        </button>
      </div>
      {cashChoice === 'custom' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-2xl border border-ink/[0.08] bg-card px-3 py-3.5 font-mono text-[15px] text-ink-muted">
            S/
          </span>
          <input
            className="t-field"
            inputMode="decimal"
            placeholder={total.toFixed(2)}
            value={cashCustom}
            maxLength={7}
            onChange={(e) => setCashCustom(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </div>
      )}
      <p
        className={`mt-3 text-[13px] font-medium tabular-nums ${
          cashAmount >= total ? 'text-success' : 'text-danger'
        }`}
      >
        {cashAmount >= total
          ? cashChange > 0
            ? `Tu vuelto: ${soles(cashChange)}`
            : 'Pago exacto, sin vuelto.'
          : `El monto debe cubrir el total (${soles(total)})`}
      </p>
    </div>
  )
}
