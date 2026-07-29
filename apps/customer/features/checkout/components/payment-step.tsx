'use client'

import { cn } from '@tindivo/ui'
import { CashSelector } from '@/features/checkout/components/cash-selector'
import { OrderDetail } from '@/features/checkout/components/order-detail'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import type { UseCheckoutValidationReturn } from '@/features/checkout/hooks/use-checkout-validation'
import { soles } from '@/features/checkout/lib/format'
import type { PaymentOption } from '@/features/checkout/types'

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    value: 'pending_cash',
    label: 'Efectivo al recibir',
    desc: 'Paga en efectivo al motorizado',
    logos: ['cash'],
  },
  {
    value: 'pending_yape',
    label: 'Billetera digital al recibir',
    desc: 'Yape o Plin al recibir tu pedido',
    logos: ['yape', 'plin'],
  },
  {
    value: 'prepaid',
    label: 'Prepago con billetera digital',
    desc: 'Paga ahora con Yape/Plin y sube tu comprobante',
    logos: ['yape', 'plin'],
  },
]

export function PaymentStep({
  checkout,
  validation,
}: {
  checkout: CheckoutViewModel
  validation: UseCheckoutValidationReturn
}) {
  const {
    payment,
    setPayment,
    mustPrepay,
    prepayReason,
    cashChoice,
    setCashChoice,
    cashCustom,
    setCashCustom,
    total,
    subtotal,
    deliveryFee,
    cart,
    error,
  } = checkout
  const { cashAmount, cashChange } = validation

  function handleSelect(opt: PaymentOption) {
    setPayment(opt.value)
    if (opt.value !== 'pending_cash') {
      setCashChoice('exact')
      setCashCustom('')
    }
  }

  return (
    <div className="px-4 pt-3 lg:px-0">
      {prepayReason && (
        <p className="rounded-xl bg-brand-soft px-3 py-2.5 text-[13px] text-brand-dark">
          {prepayReason}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2.5">
        {PAYMENT_OPTIONS.filter((opt) => !mustPrepay || opt.value === 'prepaid').map((opt) => {
          const disabled = mustPrepay && opt.value !== 'prepaid'
          const sel = payment === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(opt)}
              className={cn(
                'flex items-center gap-3 rounded-[18px] border bg-card p-4 text-left transition-shadow disabled:opacity-40',
                sel ? 'border-2 border-brand shadow-elev-1' : 'border-ink/[0.04]',
              )}
            >
              <span
                className={cn(
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                  sel ? 'border-brand' : 'border-ink-subtle',
                )}
              >
                {sel && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {opt.logos.map((logo) => (
                  <img
                    key={logo}
                    src={`/pay/${logo}.svg`}
                    alt={logo === 'cash' ? 'Efectivo' : logo === 'yape' ? 'Yape' : 'Plin'}
                    width={34}
                    height={34}
                    className="rounded-[9px]"
                  />
                ))}
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-[15px] text-ink">{opt.label}</span>
                <span className="block text-[12px] text-ink-muted">{opt.desc}</span>
              </span>
            </button>
          )
        })}
      </div>

      {payment === 'pending_cash' && (
        <CashSelector
          total={total}
          cashChoice={cashChoice}
          setCashChoice={setCashChoice}
          cashCustom={cashCustom}
          setCashCustom={setCashCustom}
          cashAmount={cashAmount}
          cashChange={cashChange}
        />
      )}

      {error && <p className="mt-3 text-danger text-sm">{error}</p>}

      <div className="lg:hidden">
        <OrderDetail />
        <Summary subtotal={subtotal} deliveryFee={deliveryFee} total={total} count={cart.count()} />
      </div>
    </div>
  )
}

function Summary({
  subtotal,
  deliveryFee,
  total,
  count,
}: {
  subtotal: number
  deliveryFee: number
  total: number
  count: number
}) {
  return (
    <div className="t-card mt-5 p-4">
      <div className="t-eyebrow mb-2.5">Resumen</div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink-muted tabular-nums">
        <span>Productos ({count})</span>
        <span>{soles(subtotal)}</span>
      </div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink-muted tabular-nums">
        <span>Delivery</span>
        <span>{soles(deliveryFee)}</span>
      </div>
      <div className="my-2.5 h-px bg-ink/[0.08]" />
      <div className="flex justify-between py-1 text-[17px] font-bold text-ink tabular-nums">
        <span>Total a pagar</span>
        <span>{soles(total)}</span>
      </div>
    </div>
  )
}
