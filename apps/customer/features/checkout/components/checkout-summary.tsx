import { OrderDetail } from '@/features/checkout/components/order-detail'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import type { UseCheckoutValidationReturn } from '@/features/checkout/hooks/use-checkout-validation'
import { soles } from '@/features/checkout/lib/format'

export function CheckoutSummary({
  checkout,
  validation,
}: {
  checkout: CheckoutViewModel
  validation: UseCheckoutValidationReturn
}) {
  const { subtotal, deliveryFee, total, cart, step, loading, locating } = checkout
  const { goToPayment } = validation

  const ctaLabel =
    step === 'delivery'
      ? `Revisar y pagar · ${soles(total)}`
      : locating
        ? 'Verificando ubicación…'
        : loading
          ? 'Enviando…'
          : `Confirmar pedido · ${soles(total)}`

  const ctaAction = step === 'delivery' ? goToPayment : () => void checkout.placeOrder()
  const ctaDisabled = step === 'payment' && loading

  return (
    <>
      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <OrderDetail />
        <Summary subtotal={subtotal} deliveryFee={deliveryFee} total={total} count={cart.count()} />
        <button
          type="button"
          className="t-btn t-btn-primary t-btn-block mt-4"
          disabled={ctaDisabled}
          onClick={ctaAction}
        >
          {ctaLabel}
        </button>
      </aside>

      <div className="t-sticky-cta mx-auto max-w-[768px] lg:hidden">
        <button
          type="button"
          className="t-btn t-btn-primary t-btn-block"
          disabled={ctaDisabled}
          onClick={ctaAction}
        >
          {ctaLabel}
        </button>
      </div>
    </>
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
    <div className="mt-5 rounded-[22px] border border-ink/5 bg-white p-4">
      <div className="t-eyebrow mb-2.5">Resumen</div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink/70 tabular-nums">
        <span>Productos ({count})</span>
        <span>{soles(subtotal)}</span>
      </div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink/70 tabular-nums">
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
