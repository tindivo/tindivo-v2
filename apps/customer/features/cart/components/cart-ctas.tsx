'use client'

import { getOpenStatus } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AddressGateModal } from '@/components/gates/address-gate-modal'
import { PaymentResolutionGateModal } from '@/components/gates/payment-resolution-gate-modal'
import { PhoneGateModal } from '@/components/gates/phone-gate-modal'
import { CartBusinessGate } from '@/features/cart/components/cart-business-gate'
import type { CartLayout } from '@/features/cart/types'
import { useOrderReadiness } from '@/hooks/use-order-readiness'
import { useBusinessOrdering } from '@/lib/business-ordering'
import { useCart } from '@/lib/cart'
import { useOnboarding } from '@/lib/onboarding-store'

interface CartCtasProps {
  layout: CartLayout
  onNavigate?: () => void
}

export function CartCtas({ layout, onNavigate }: CartCtasProps) {
  const router = useRouter()
  const cart = useCart()
  const { loading: bizLoading, info } = useBusinessOrdering(cart.businessId)
  const {
    loading: readinessLoading,
    ready,
    currentGate,
    blockedOrderShortId,
    refetch,
  } = useOrderReadiness()
  const [showGate, setShowGate] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (showGate && ready) {
      setShowGate(false)
      onNavigate?.()
      router.push('/checkout')
    }
  }, [showGate, ready, onNavigate, router])

  const closed =
    info?.mode === 'delivery' &&
    info.schedule.length > 0 &&
    getOpenStatus(info.schedule, now).kind === 'closed'

  if (info?.mode === 'whatsapp') {
    return <CartBusinessGate info={info} layout={layout} />
  }

  function handleCheckout() {
    if (ready) {
      onNavigate?.()
      router.push('/checkout')
      return
    }
    if (currentGate === 'auth') {
      useOnboarding.getState().openSheet({ next: '/checkout' })
      return
    }
    setShowGate(true)
  }

  async function handleGateComplete() {
    await refetch()
  }

  const loading = bizLoading || readinessLoading
  const block = layout === 'block'

  return (
    <>
      <div className={block ? 'mt-3' : 'flex flex-1 flex-col gap-1.5'}>
        <button
          type="button"
          className={`t-btn t-btn-primary ${block ? 't-btn-block' : 'w-full'}`}
          disabled={loading || closed}
          onClick={handleCheckout}
        >
          {readinessLoading ? 'Cargando…' : 'Ir a pagar'}
        </button>
        {closed && (
          <p className={`text-[12px] text-ink/55 ${block ? 'mt-1.5' : ''}`}>
            El restaurante está cerrado ahora.
          </p>
        )}
      </div>

      {showGate && currentGate === 'phone' && (
        <PhoneGateModal onComplete={handleGateComplete} onClose={() => setShowGate(false)} />
      )}

      {showGate && currentGate === 'address' && (
        <AddressGateModal onComplete={handleGateComplete} onClose={() => setShowGate(false)} />
      )}

      {showGate && currentGate === 'pending_payment_resolution' && blockedOrderShortId && (
        <PaymentResolutionGateModal
          shortId={blockedOrderShortId}
          onClose={() => {
            setShowGate(false)
            refetch()
          }}
        />
      )}
    </>
  )
}
