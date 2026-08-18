'use client'

import { OtpVerificationSheet } from '@/components/otp-verification-sheet'
import { BlockedView } from '@/features/checkout/components/blocked-view'
import { GeoBlockView } from '@/features/checkout/components/geo-block-view'
import { UnifiedCheckout } from '@/features/checkout/components/unified-checkout'
import { useCheckout } from '@/features/checkout/hooks/use-checkout'
import { useCheckoutValidation } from '@/features/checkout/hooks/use-checkout-validation'

export default function CheckoutPage() {
  const checkout = useCheckout()
  const validation = useCheckoutValidation(checkout)

  const {
    blocked,
    confirmed,
    geoBlock,
    setGeoBlock,
    payment,
    setPayment,
    placeOrder,
    showOtpSheet,
    setShowOtpSheet,
    phone,
    setVerifiedPhone,
    authReady,
  } = checkout

  if (blocked) return <BlockedView />
  if (geoBlock)
    return (
      <GeoBlockView
        kind={geoBlock}
        onRetry={() => {
          setGeoBlock(null)
          void placeOrder()
        }}
        onPrepay={() => {
          setGeoBlock(null)
          setPayment('prepaid')
          void placeOrder({ paymentIntent: 'prepaid', skipGps: true })
        }}
      />
    )
  // El pedido ya existe y `placeOrder` lanzó la navegación al tracking, que es
  // donde el cliente ve el estado en vivo y puede cancelar. Esto es solo el
  // relevo hasta que la ruta nueva monta: sin él se vería por un instante el
  // checkout con el carrito ya vacío.
  if (confirmed)
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-3 px-6">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-ink/10 border-t-brand" />
        <p className="text-[15px] text-ink-muted">Abriendo tu pedido…</p>
      </main>
    )
  if (!authReady)
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16">
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </main>
    )

  return (
    <>
      <UnifiedCheckout checkout={checkout} validation={validation} />
      <OtpVerificationSheet
        open={showOtpSheet}
        phone={phone}
        onVerified={() => {
          setVerifiedPhone(phone)
          setShowOtpSheet(false)
          setTimeout(() => {
            placeOrder({ paymentIntent: payment })
          }, 300)
        }}
        onClose={() => setShowOtpSheet(false)}
      />
    </>
  )
}
