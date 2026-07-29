'use client'

import type { DeliveryMethod, PaymentIntent } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { AddressValue } from '@/components/address-fields'
import { EMPTY_ADDRESS } from '@/components/address-fields'
import {
  type Address,
  type CashChoice,
  DEFAULT_PREPAY_THRESHOLD,
  type GeoBlockKind,
  NEAR_DELIVERY_FEE,
  type OrderResult,
} from '@/features/checkout/types'
import { useBusinessOrdering } from '@/lib/business-ordering'
import { type CartState, useCart, useCartHydrated } from '@/lib/cart'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface CheckoutState {
  router: ReturnType<typeof useRouter>
  cart: CartState
  cartHydrated: boolean

  authReady: boolean
  setAuthReady: (v: boolean) => void
  userId: string | null
  setUserId: (v: string | null) => void
  phone: string
  setPhone: (v: string) => void
  verifiedPhone: string
  setVerifiedPhone: (v: string) => void
  name: string
  setName: (v: string) => void
  addresses: Address[]
  setAddresses: (v: Address[]) => void
  addressId: string | null
  setAddressId: (v: string | null) => void
  manualAddr: AddressValue
  setManualAddr: (v: AddressValue | ((prev: AddressValue) => AddressValue)) => void
  manualInside: boolean
  setManualInside: (v: boolean) => void

  step: 'delivery' | 'payment'
  setStep: (v: 'delivery' | 'payment') => void
  deliveryMethod: DeliveryMethod
  setDeliveryMethod: (v: DeliveryMethod) => void

  payment: PaymentIntent
  setPayment: (v: PaymentIntent) => void
  cashChoice: CashChoice
  setCashChoice: (v: CashChoice) => void
  cashCustom: string
  setCashCustom: (v: string) => void

  prepayThreshold: number
  setPrepayThreshold: (v: number) => void
  prepayOnlyByRisk: boolean
  setPrepayOnlyByRisk: (v: boolean) => void
  deliveredCount: number
  setDeliveredCount: (v: number) => void

  locating: boolean
  setLocating: (v: boolean) => void
  loading: boolean
  setLoading: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  confirmed: OrderResult | null
  setConfirmed: (v: OrderResult | null) => void
  blocked: boolean
  setBlocked: (v: boolean) => void
  geoBlock: GeoBlockKind | null
  setGeoBlock: (v: GeoBlockKind | null) => void
  showOtpSheet: boolean
  setShowOtpSheet: (v: boolean) => void

  subtotal: number
  deliveryFee: number
  total: number
  isNewUser: boolean
  exceedsCashCap: boolean
  isBlocked: boolean
  mustPrepay: boolean
  prepayReason: string | null

  selectedAddress: Address | undefined
  reference: string
  line: string
}

export function useCheckoutState(): CheckoutState {
  const router = useRouter()
  const cart = useCart()
  const cartHydrated = useCartHydrated()

  const [authReady, setAuthReady] = useState(false)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState<string | null>(null)
  const [manualAddr, setManualAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [manualInside, setManualInside] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [step, setStep] = useState<'delivery' | 'payment'>('delivery')
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('delivery')
  const [payment, setPayment] = useState<PaymentIntent>('pending_cash')
  const [cashChoice, setCashChoice] = useState<CashChoice>('exact')
  const [cashCustom, setCashCustom] = useState('')
  const [geoBlock, setGeoBlock] = useState<GeoBlockKind | null>(null)
  const [prepayThreshold, setPrepayThreshold] = useState(DEFAULT_PREPAY_THRESHOLD)
  const [prepayOnlyByRisk, setPrepayOnlyByRisk] = useState(false)
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<OrderResult | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [showOtpSheet, setShowOtpSheet] = useState(false)

  const subtotal = cart.subtotal()
  const deliveryFee = deliveryMethod === 'pickup' ? 0 : NEAR_DELIVERY_FEE
  const total = useMemo(
    () => Math.round((subtotal + deliveryFee) * 100) / 100,
    [subtotal, deliveryFee],
  )
  const isNewUser = deliveredCount < 1
  const exceedsCashCap = total > prepayThreshold
  const isBlocked = prepayOnlyByRisk

  const mustPrepay = isNewUser || exceedsCashCap || isBlocked

  const prepayReason = isBlocked
    ? 'Tu cuenta tiene restringido el pago contraentrega.'
    : isNewUser
      ? 'En tu primer pedido el pago es adelantado. Después podrás pagar al recibir.'
      : exceedsCashCap
        ? `Pedidos mayores a S/${prepayThreshold} requieren pago adelantado.`
        : null

  // Modo catálogo: el negocio no acepta pedidos web — el pedido va por WhatsApp
  // desde su página. Cubre deep-links a /checkout y carritos persistidos de un
  // negocio que cambió de modo (el guard 409 del API es la última línea).
  const ordering = useBusinessOrdering(cartHydrated ? cart.businessId : null)
  useEffect(() => {
    if (!cartHydrated || confirmed) return
    if (ordering.info?.mode === 'whatsapp' && cart.businessId) {
      router.replace(`/negocio/${cart.businessId}`)
    }
  }, [cartHydrated, confirmed, ordering.info, cart.businessId, router])

  useEffect(() => {
    getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'prepay_threshold')
      .maybeSingle()
      .then(({ data }) => {
        const raw = data?.value
        const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        if (value && Number.isFinite(value)) setPrepayThreshold(value)
      })
  }, [])

  useEffect(() => {
    if (mustPrepay && payment !== 'prepaid') setPayment('prepaid')
  }, [mustPrepay, payment])

  const selectedAddress = addresses.find((a) => a.id === addressId)
  const reference =
    deliveryMethod === 'delivery' ? (selectedAddress?.reference ?? manualAddr.reference) : ''
  const line = deliveryMethod === 'delivery' ? (selectedAddress?.line ?? manualAddr.line) : ''

  return {
    router,
    cart,
    cartHydrated,
    authReady,
    setAuthReady,
    userId,
    setUserId,
    phone,
    setPhone,
    verifiedPhone,
    setVerifiedPhone,
    name,
    setName,
    addresses,
    setAddresses,
    addressId,
    setAddressId,
    manualAddr,
    setManualAddr,
    manualInside,
    setManualInside,
    step,
    setStep,
    deliveryMethod,
    setDeliveryMethod,
    payment,
    setPayment,
    cashChoice,
    setCashChoice,
    cashCustom,
    setCashCustom,
    prepayThreshold,
    setPrepayThreshold,
    prepayOnlyByRisk,
    setPrepayOnlyByRisk,
    deliveredCount,
    setDeliveredCount,
    locating,
    setLocating,
    loading,
    setLoading,
    error,
    setError,
    confirmed,
    setConfirmed,
    blocked,
    setBlocked,
    geoBlock,
    setGeoBlock,
    showOtpSheet,
    setShowOtpSheet,
    subtotal,
    deliveryFee,
    total,
    isNewUser,
    exceedsCashCap,
    isBlocked,
    mustPrepay,
    prepayReason,
    selectedAddress,
    reference,
    line,
  }
}
