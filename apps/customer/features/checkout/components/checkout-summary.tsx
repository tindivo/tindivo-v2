import { Button, Card } from '@tindivo/ui'
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
        <Button
          type="button"
          variant="brand"
          className="mt-4 w-full"
          disabled={ctaDisabled}
          onClick={ctaAction}
        >
          {ctaLabel}
        </Button>
      </aside>

      <div className="sticky bottom-0 z-10 mx-auto max-w-[768px] bg-gradient-to-t from-surface via-surface/95 to-transparent px-4 pt-3 pb-5 lg:hidden">
        <Button
          type="button"
          variant="brand"
          className="w-full"
          disabled={ctaDisabled}
          onClick={ctaAction}
        >
          {ctaLabel}
        </Button>
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
    <Card className="mt-5 p-4">
      <div className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Resumen
      </div>
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
    </Card>
  )
}
