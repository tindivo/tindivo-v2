import { Card } from '@tindivo/ui'
import { soles } from '@/features/checkout/lib/format'
import { CASH_CHIPS, CASH_STEP, type CashChoice } from '@/features/checkout/types'

interface CashSelectorProps {
  total: number
  cashChoice: CashChoice
  setCashChoice: (v: CashChoice) => void
  cashCustom: string
  setCashCustom: (v: string) => void
  cashAmount: number
  cashChange: number
  maxCashBill: number
  maxChange: number
  maxDeclarable: number
}

function roundToStep(n: number, step: number): number {
  return Math.round(n / step) * step
}

export function CashSelector({
  total,
  cashChoice,
  setCashChoice,
  cashCustom,
  setCashCustom,
  cashAmount,
  cashChange,
  maxCashBill,
  maxChange,
  maxDeclarable,
}: CashSelectorProps) {
  // Mensaje de validación en orden de precedencia (R2 antes que R3)
  const validationMsg = (() => {
    if (cashAmount < total) {
      return `El monto debe cubrir el total (${soles(total)})`
    }
    if (cashAmount > maxCashBill) {
      return `El monto máximo con el que puedes pagar es S/ ${maxCashBill.toFixed(2)}.`
    }
    if (cashChange > maxChange) {
      const maxCash = Math.floor((total + maxChange) * 100) / 100
      return `El vuelto sería ${soles(cashChange)} y el máximo es ${soles(maxChange)}. Paga con ${soles(maxCash)} o menos, o elige Yape.`
    }
    return null
  })()

  const isValid = validationMsg === null
  const maxLength = String(maxDeclarable.toFixed(2)).length

  function handleBlur() {
    if (cashChoice !== 'custom') return
    const n = Number.parseFloat(cashCustom)
    if (!Number.isNaN(n) && n > 0) {
      const rounded = roundToStep(n, CASH_STEP)
      setCashCustom(rounded.toFixed(2))
    }
  }

  return (
    <Card className="mt-3 p-4">
      <div className="font-semibold text-[15px] text-ink">¿Con cuánto pagarás?</div>
      <p className="mt-0.5 text-[12px] text-ink-muted">Así el motorizado lleva tu vuelto exacto.</p>

      {/* Avisos de límite: estático + dinámico */}
      <div className="mt-1.5 flex flex-col gap-0.5">
        <p className="text-[11px] text-ink-subtle">Máximo {soles(maxChange)} de vuelto.</p>
        <p className="text-[11px] text-ink-subtle">
          Puedes pagar hasta con {soles(maxDeclarable)}.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CASH_CHIPS.filter((c) => c.amount === null || c.amount >= total).map((c) => {
          const sel = cashChoice === c.value
          const disabled = c.amount !== null && c.amount > maxDeclarable
          return (
            <button
              key={c.value}
              type="button"
              disabled={disabled}
              title={disabled ? `Vuelto pasaría de ${soles(maxChange)}` : undefined}
              onClick={() => !disabled && setCashChoice(c.value)}
              className={`rounded-full px-3.5 py-2 font-semibold text-[13px] transition-colors ${
                disabled
                  ? 'cursor-not-allowed border border-ink/[0.08] bg-surface-low text-ink opacity-40'
                  : sel
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
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            inputMode="decimal"
            placeholder={total.toFixed(2)}
            value={cashCustom}
            maxLength={maxLength}
            onChange={(e) => setCashCustom(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={handleBlur}
          />
        </div>
      )}

      <p
        className={`mt-3 text-[13px] font-medium tabular-nums ${
          isValid ? (cashChange > 0 ? 'text-success' : 'text-ink-muted') : 'text-danger'
        }`}
      >
        {isValid
          ? cashChange > 0
            ? `Tu vuelto: ${soles(cashChange)}`
            : 'Pago exacto, sin vuelto.'
          : validationMsg}
      </p>
    </Card>
  )
}
