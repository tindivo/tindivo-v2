'use client'

import { ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { OtpVerificationSheet } from '@/components/otp-verification-sheet'
import { BlockedView } from '@/features/checkout/components/blocked-view'
import { CheckoutSummary } from '@/features/checkout/components/checkout-summary'
import { ConfirmedView } from '@/features/checkout/components/confirmed-view'
import { DeliveryStep } from '@/features/checkout/components/delivery-step'
import { GeoBlockView } from '@/features/checkout/components/geo-block-view'
import { PaymentStep } from '@/features/checkout/components/payment-step'
import { useCheckout } from '@/features/checkout/hooks/use-checkout'
import { useCheckoutValidation } from '@/features/checkout/hooks/use-checkout-validation'

export default function CheckoutPage() {
  const router = useRouter()
  const checkout = useCheckout()
  const validation = useCheckoutValidation(checkout)

  const {
    authReady,
    blocked,
    confirmed,
    geoBlock,
    setGeoBlock,
    payment,
    setPayment,
    setVerifiedPhone,
    showOtpSheet,
    setShowOtpSheet,
    step,
    setStep,
    placeOrder,
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
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      </main>
    )

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-32 lg:grid lg:max-w-6xl lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:px-6 lg:pt-1">
      <div className="lg:col-span-2">
        <ScreenHeader
          title={step === 'delivery' ? 'Datos de entrega' : 'Método de pago'}
          onBack={() => (step === 'payment' ? setStep('delivery') : router.back())}
        />
      </div>

      <div className="pt-1 pb-6 lg:pb-0">
        {step === 'delivery' ? (
          <DeliveryStep checkout={checkout} />
        ) : (
          <PaymentStep checkout={checkout} validation={validation} />
        )}
      </div>

      <CheckoutSummary checkout={checkout} validation={validation} />

      <OtpVerificationSheet
        open={showOtpSheet}
        phone={checkout.phone}
        onVerified={() => {
          setVerifiedPhone(checkout.phone)
          setShowOtpSheet(false)
          setTimeout(() => {
            placeOrder({ paymentIntent: payment })
          }, 300)
        }}
        onClose={() => setShowOtpSheet(false)}
      />
    </main>
  )
}
