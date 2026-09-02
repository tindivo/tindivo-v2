'use client'

import type { DeliveryMethod, PaymentIntent } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AddressValue } from '@/components/address-fields'
import { EMPTY_ADDRESS } from '@/components/address-fields'
import { maxDeclarable as maxDeclarableCash } from '@/features/checkout/lib/cash'
import {
  type Address,
  type CashChoice,
  DEFAULT_MAX_CASH_BILL,
  DEFAULT_MAX_CHANGE,
  DEFAULT_PREPAY_THRESHOLD,
  DEFAULT_PREPAY_TIMERS,
  type GeoBlockKind,
  type OrderResult,
  PROMO_DESCONOCIDA,
  type PrepayTimers,
  type PromoState,
} from '@/features/checkout/types'
import { useBusinessOrdering } from '@/lib/business-ordering'
import { type CartState, useCart, useCartHydrated } from '@/lib/cart'
import type { LatLng } from '@/lib/coverage'
import {
  bandForPoint,
  type DeliveryBands,
  type DistanceBand,
  getDeliveryBands,
  getFarZones,
} from '@/lib/delivery-fee'
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
  /**
   * Nota libre para el MOTORIZADO —«toca el timbre dos veces», «hay perro»—.
   * Opcional: nunca bloquea el pedido. Viaja a `orders.customer_notes`, que la
   * app de motorizados ya pinta desde antes; lo que faltaba era escribirla.
   */
  customerNote: string
  setCustomerNote: (v: string) => void

  prepayThreshold: number
  setPrepayThreshold: (v: number) => void
  /**
   * Los dos plazos del prepago, para poder prometerlos ANTES de pedir. Salen de
   * `app_settings.timers`, no de una constante: ver `DEFAULT_PREPAY_TIMERS`.
   */
  prepayTimers: PrepayTimers
  maxCashBill: number
  setMaxCashBill: (v: number) => void
  maxChange: number
  setMaxChange: (v: number) => void
  refreshMaxChange: () => Promise<number>
  maxDeclarable: number
  prepayOnlyByRisk: boolean
  setPrepayOnlyByRisk: (v: boolean) => void
  /**
   * ¿Puede este cliente pagar contraentrega sin prepago? Lo decide la DB
   * (`current_customer_trusted_for_contraentrega`, migración 0171), no el
   * navegador: cuentan las entregas de su cuenta, las de su teléfono verificado
   * en v2 —incluidos los pedidos que tomó la cajera— y las del v1 congeladas en
   * el directorio. Antes esto era un `count` de pedidos propios `delivered`, que
   * en el piloto casi nadie tiene.
   */
  hasDeliveryHistory: boolean
  setHasDeliveryHistory: (v: boolean) => void
  /**
   * Promo de envío gratis del lanzamiento (0187). Lo decide la DB
   * (`current_customer_promo_free_delivery`), no el navegador. Es SOLO para
   * pintar: quien la aplica y reserva el cupo es `create_customer_order`.
   */
  promo: PromoState
  setPromo: (v: PromoState) => void

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
  /** Lo que costaría el envío sin la promo. Para el tachado. */
  nominalDeliveryFee: number
  promoApplies: boolean
  distanceBand: DistanceBand
  total: number
  isNewUser: boolean
  exceedsCashCap: boolean
  isBlocked: boolean
  mustPrepay: boolean
  prepayReason: string | null

  /**
   * Ventana de entrega que promete el negocio, en minutos, o `null` si no la
   * tiene puesta. Sale de la MISMA respuesta que ya se pedía para saber si el
   * negocio acepta pedidos web: cero peticiones nuevas.
   */
  eta: { min: number; max: number } | null

  selectedAddress: Address | undefined
  reference: string
  line: string
  reloadAddresses: () => Promise<void>
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
  const [customerNote, setCustomerNote] = useState('')
  const [geoBlock, setGeoBlock] = useState<GeoBlockKind | null>(null)
  const [prepayThreshold, setPrepayThreshold] = useState(DEFAULT_PREPAY_THRESHOLD)
  const [prepayTimers, setPrepayTimers] = useState<PrepayTimers>({ ...DEFAULT_PREPAY_TIMERS })
  const [maxCashBill, setMaxCashBill] = useState(DEFAULT_MAX_CASH_BILL)
  const [maxChange, setMaxChange] = useState(DEFAULT_MAX_CHANGE)
  const [prepayOnlyByRisk, setPrepayOnlyByRisk] = useState(false)
  const [hasDeliveryHistory, setHasDeliveryHistory] = useState(false)
  const [promo, setPromo] = useState<PromoState>(PROMO_DESCONOCIDA)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<OrderResult | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [showOtpSheet, setShowOtpSheet] = useState(false)
  const [bands, setBands] = useState<DeliveryBands>({ near: 2.0, far: 2.5 })
  const [farZones, setFarZones] = useState<LatLng[][]>([])

  useEffect(() => {
    getDeliveryBands().then(setBands)
    getFarZones().then(setFarZones)
  }, [])

  const selectedAddress = addresses.find((a) => a.id === addressId)

  const distanceBand = useMemo((): DistanceBand => {
    const coords =
      selectedAddress &&
      selectedAddress.coordinates_lat != null &&
      selectedAddress.coordinates_lng != null
        ? { lat: selectedAddress.coordinates_lat, lng: selectedAddress.coordinates_lng }
        : manualAddr.coords
    return bandForPoint(coords, farZones)
  }, [selectedAddress, manualAddr.coords, farZones])

  const subtotal = cart.subtotal()

  /** Tarifa que corresponde al pin, ANTES de la promo. Se pinta tachada. */
  const nominalDeliveryFee =
    deliveryMethod === 'pickup' ? 0 : distanceBand === 'far' ? bands.far : bands.near

  /**
   * Promo de lanzamiento (0187): el envío va por cuenta de Tindivo.
   *
   * Solo aplica a `delivery`. En pickup el envío ya es 0 y regalar lo que es
   * gratis quemaría el cupo del cliente — el servidor lo excluye igual, esto es
   * para que la pantalla no diga "GRATIS por la promo" cuando no lo es.
   */
  const promoApplies = promo.eligible && deliveryMethod === 'delivery' && nominalDeliveryFee > 0
  const deliveryFee = promoApplies ? 0 : nominalDeliveryFee
  const total = useMemo(
    () => Math.round((subtotal + deliveryFee) * 100) / 100,
    [subtotal, deliveryFee],
  )
  const isNewUser = !hasDeliveryHistory
  const exceedsCashCap = total > prepayThreshold
  const isBlocked = prepayOnlyByRisk

  const mustPrepay = isNewUser || exceedsCashCap || isBlocked

  // Máximo declarable = mín(billete máximo, total + vuelto máximo). La fórmula
  // vive en `lib/cash.ts` con el resto de la regla del vuelto.
  const maxDeclarable = useMemo(
    () => maxDeclarableCash({ total, maxCashBill, maxChange }),
    [maxCashBill, maxChange, total],
  )

  /**
   * Por qué este pedido no puede pagarse al recibir.
   *
   * Las tres frases evitan la palabra «contraentrega». Es vocabulario interno
   * —lo usan la caja, el motorizado y las RPC— y en esta pantalla las opciones
   * se llaman «al recibir»: dos nombres para lo mismo, a dos dedos de
   * distancia, obligan al cliente a deducir que son sinónimos.
   *
   * La del umbral nombra el ENVÍO a propósito. `exceedsCashCap` compara contra
   * `total`, que lleva el delivery dentro —y el servidor hace lo mismo
   * (`v_order_amount + v_delivery_fee > v_threshold`)—, así que una bolsa de
   * S/79 con S/2 de envío obliga a prepagar mientras el cartel decía «pedidos
   * mayores a S/80». El cliente miraba su bolsa, veía 79, y no le cuadraba.
   *
   * La del bloqueo no acusa ni explica el motivo —es antifraude— pero deja una
   * puerta: sin ella, «tu cuenta tiene restringido» es un callejón sin salida
   * escrito en pasiva.
   */
  const prepayReason = isBlocked
    ? 'Por ahora tus pedidos van con pago adelantado. Si crees que es un error, escríbenos.'
    : isNewUser
      ? 'Es tu primer pedido, así que va con pago adelantado. En el siguiente ya puedes pagar al recibir.'
      : exceedsCashCap
        ? `Tu total con envío pasa de S/${prepayThreshold}, así que el pago va adelantado.`
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

  // Una sola query para las configuraciones globales que necesita esta pantalla
  // — no un round-trip por cada una. `max_change` ya no está aquí: lo pone la
  // caja del negocio.
  //
  // `timers` entró con la `0193`, que lo añadió a la whitelist `as_public_read`.
  // Sin esa migración esta fila vuelve VACÍA en silencio —sin error, sin fila— y
  // los plazos se quedarían en el fallback para siempre.
  useEffect(() => {
    getSupabaseBrowser()
      .from('app_settings')
      .select('key, value')
      .in('key', ['prepay_threshold', 'max_cash_bill', 'timers'])
      .then(({ data }) => {
        for (const row of data ?? []) {
          const raw = row.value
          // `timers` es un objeto, no un escalar: se trata antes de la coerción
          // numérica de abajo, que lo convertiría en `NaN` y lo descartaría.
          if (row.key === 'timers') {
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
              const t = raw as Record<string, unknown>
              const min = (k: string, porDefecto: number) => {
                const n = typeof t[k] === 'number' ? (t[k] as number) : Number(t[k])
                return Number.isFinite(n) && n > 0 ? n : porDefecto
              }
              setPrepayTimers({
                acceptance: min('acceptanceMinutes', DEFAULT_PREPAY_TIMERS.acceptance),
                payment: min('paymentMinutes', DEFAULT_PREPAY_TIMERS.payment),
              })
            }
            continue
          }
          const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
          if (!v || !Number.isFinite(v)) continue
          if (row.key === 'prepay_threshold') setPrepayThreshold(v)
          else if (row.key === 'max_cash_bill') setMaxCashBill(v)
        }
      })
  }, [])

  // El techo de vuelto es de la noche y del negocio, no una constante global.
  // Se pregunta por RPC en vez de leer `business_service_days` directo para que
  // el fallback a `app_settings.max_change` lo resuelva el mismo código que usa
  // `create_customer_order`: si el cliente lo calculara por su cuenta podría
  // habilitar un chip que el servidor luego rechaza.
  //
  // Cero es una respuesta válida —"hoy solo pago exacto"—, así que el guard es
  // `Number.isFinite`, nunca un `if (v)` que lo confundiría con "no llegó".
  const refreshMaxChange = useCallback(async (): Promise<number> => {
    if (!cartHydrated || !cart.businessId) return maxChange
    try {
      const { data, error: rpcErr } = await getSupabaseBrowser().rpc('effective_max_change', {
        p_business_id: cart.businessId,
      })
      if (rpcErr) return maxChange
      const v = typeof data === 'number' ? data : Number(data)
      if (Number.isFinite(v)) {
        setMaxChange(v)
        return v
      }
      return maxChange
    } catch {
      return maxChange
    }
  }, [cartHydrated, cart.businessId, maxChange])

  useEffect(() => {
    if (!cartHydrated || !cart.businessId) return
    let cancelled = false
    getSupabaseBrowser()
      .rpc('effective_max_change', { p_business_id: cart.businessId })
      .then(({ data, error: rpcErr }) => {
        if (cancelled || rpcErr) return
        const v = typeof data === 'number' ? data : Number(data)
        if (Number.isFinite(v)) setMaxChange(v)
      })
    return () => {
      cancelled = true
    }
  }, [cartHydrated, cart.businessId])

  // NO forzar nada antes de saber quién es el cliente. `hasDeliveryHistory`
  // arranca en `false` y lo resuelve un RPC, así que sin este guard la secuencia
  // es: monta → `mustPrepay` true → fuerza `prepaid` → llega la respuesta →
  // `mustPrepay` pasa a false → y el pago se queda en `prepaid`, porque este
  // efecto solo empuja hacia el prepago, nunca de vuelta.
  //
  // Resultado: el vecino conocido llegaba a la pantalla de pago con "Pago
  // adelantado" ya marcado y sin banner que lo explicara —las otras opciones
  // habilitadas pero sin elegir—, que es justo lo que la 0171 viene a evitar.
  // El efecto corre aunque la página muestre el esqueleto: `checkout/page.tsx`
  // no monta `UnifiedCheckout` hasta `authReady`, pero los hooks ya corrieron.
  //
  // Todo camino que llega a la pantalla de pago resuelve el historial ANTES de
  // `setAuthReady(true)`; el único que no lo hace es el del cliente bloqueado,
  // que va a `BlockedView` y no tiene pantalla de pago.
  useEffect(() => {
    if (!authReady) return
    if (mustPrepay && payment !== 'prepaid') setPayment('prepaid')
  }, [authReady, mustPrepay, payment])

  const reference =
    deliveryMethod === 'delivery' ? (selectedAddress?.reference ?? manualAddr.reference) : ''
  const line = deliveryMethod === 'delivery' ? (selectedAddress?.line ?? manualAddr.line) : ''

  const reloadAddresses = useCallback(async () => {
    const { data: addrs } = await getSupabaseBrowser()
      .from('customer_addresses')
      .select(
        'id,label,line,reference,is_default,coordinates_lat,coordinates_lng,location_confirmed_at',
      )
      .order('is_default', { ascending: false })
    setAddresses((addrs ?? []) as CheckoutState['addresses'])
    setAddressId((prev) => prev ?? addrs?.find((a) => a.is_default)?.id ?? addrs?.[0]?.id ?? null)
  }, [])

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
    customerNote,
    setCustomerNote,
    prepayThreshold,
    setPrepayThreshold,
    prepayTimers,
    maxCashBill,
    setMaxCashBill,
    maxChange,
    setMaxChange,
    refreshMaxChange,
    maxDeclarable,
    prepayOnlyByRisk,
    setPrepayOnlyByRisk,
    hasDeliveryHistory,
    setHasDeliveryHistory,
    promo,
    setPromo,
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
    nominalDeliveryFee,
    promoApplies,
    distanceBand,
    total,
    isNewUser,
    exceedsCashCap,
    isBlocked,
    mustPrepay,
    prepayReason,
    eta:
      ordering.info?.etaMin != null && ordering.info?.etaMax != null
        ? { min: ordering.info.etaMin, max: ordering.info.etaMax }
        : null,
    selectedAddress,
    reference,
    line,
    reloadAddresses,
  }
}
