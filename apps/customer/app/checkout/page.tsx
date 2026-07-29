'use client'

import { OtpVerificationSheet } from '@/components/otp-verification-sheet'
import { BlockedView } from '@/features/checkout/components/blocked-view'
import { ConfirmedView } from '@/features/checkout/components/confirmed-view'
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
  if (confirmed) return <ConfirmedView result={confirmed} />
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
