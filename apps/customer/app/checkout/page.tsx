'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import type { DeliveryMethod, PaymentIntent } from '@tindivo/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, ScreenHeader, Segmented } from '@/components/ui'
import { api } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { getLocationValidation, haversineKm } from '@/lib/coverage'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number) => `S/ ${n.toFixed(2)}`
const DEFAULT_PREPAY_THRESHOLD = 80
const NEAR_DELIVERY_FEE = 2.0
// Pickup disabled for the pilot (DECISIONS.md: "pickup inactivo; post-piloto").
const PICKUP_ENABLED = false as boolean
const labelEmoji = (l: string) => (l === 'Casa' ? '🏠' : l === 'Trabajo' ? '💼' : '📍')

interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
  coordinates_lat: number | null
  coordinates_lng: number | null
}
interface OrderResult {
  id: string
  shortId: string
  status: string
  total: number
}

interface CustomerProfile {
  full_name: string | null
  phone: string | null
  contraentrega_blocked?: boolean | null
  blocked_until?: string | null
}

type GeoBlockKind = 'far' | 'unavailable' | 'low_accuracy'

interface GpsValidationPayload {
  lat?: number
  lng?: number
  accuracyM?: number
  distanceToCenterKm?: number
  method: 'gps_high_accuracy' | 'gps_low_accuracy' | 'manual_skip_prepaid' | 'failed'
}

type CashChoice = 'exact' | '20' | '50' | '100' | 'custom'
const CASH_CHIPS: { value: CashChoice; label: string; amount: number | null }[] = [
  { value: 'exact', label: 'Exacto', amount: null },
  { value: '20', label: 'S/ 20', amount: 20 },
  { value: '50', label: 'S/ 50', amount: 50 },
  { value: '100', label: 'S/ 100', amount: 100 },
]

/** Posición del dispositivo (una vez). Rechaza si no hay API o el usuario niega. */
function getPositionOnce(timeoutMs = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('geolocation_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    })
  })
}

export default function CheckoutPage() {
  const router = useRouter()
  const cart = useCart()
  const [authReady, setAuthReady] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const [step, setStep] = useState<'delivery' | 'payment'>('delivery')
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('delivery')
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState<string | null>(null)
  const [manualRef, setManualRef] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [payment, setPayment] = useState<PaymentIntent>('pending_cash')
  const [cashChoice, setCashChoice] = useState<CashChoice>('exact')
  const [cashCustom, setCashCustom] = useState('')
  const [geoBlock, setGeoBlock] = useState<GeoBlockKind | null>(null)
  const [prepayThreshold, setPrepayThreshold] = useState(DEFAULT_PREPAY_THRESHOLD)
  const [prepayOnlyByRisk, setPrepayOnlyByRisk] = useState(false)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<OrderResult | null>(null)
  const [blocked, setBlocked] = useState(false)

  const subtotal = cart.subtotal()
  const deliveryFee = deliveryMethod === 'pickup' ? 0 : NEAR_DELIVERY_FEE
  const total = useMemo(
    () => Math.round((subtotal + deliveryFee) * 100) / 100,
    [subtotal, deliveryFee],
  )
  const amountRequiresPrepay = subtotal >= prepayThreshold
  const mustPrepay = amountRequiresPrepay || prepayOnlyByRisk

  // Gate de auth (DECISIONS §15): el carrito no exige login; el checkout sí.
  // En vez de redirigir a /entrar, abre el sheet de onboarding sobre esta página.
  const sheetOpen = useOnboarding((s) => s.open)
  const openedSheetRef = useRef(false)
  const profilePromptedRef = useRef(false)

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
    if (cart.count() === 0 && !confirmed) {
      router.replace('/')
      return
    }
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        const ob = useOnboarding.getState()
        if (openedSheetRef.current && !ob.open) {
          // Cerró el sheet sin iniciar sesión: volver al carrito/carta.
          router.back()
          return
        }
        if (!ob.open) {
          openedSheetRef.current = true
          ob.openSheet({ next: '/checkout', inPlace: true })
        }
        return
      }
      if (useOnboarding.getState().open) return // esperar a que termine el onboarding
      const meta = data.session.user.user_metadata as { full_name?: string } | undefined
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('full_name,phone,contraentrega_blocked,blocked_until')
        .maybeSingle()
      // Red de seguridad: sesión (p.ej. Google en otro dispositivo) sin perfil → completar datos.
      if (!prof && !profilePromptedRef.current) {
        profilePromptedRef.current = true
        useOnboarding.getState().openSheet({
          step: 'google-name',
          path: 'google',
          variant: 'profile-incomplete',
          next: '/checkout',
          inPlace: true,
          fullName: meta?.full_name ?? null,
          email: data.session.user.email ?? null,
        })
        return
      }
      const profile = prof as CustomerProfile | null
      if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) {
        setBlocked(true)
        setAuthReady(true)
        return
      }
      setPrepayOnlyByRisk(Boolean(profile?.contraentrega_blocked))
      setName(profile?.full_name ?? meta?.full_name ?? '')
      if (profile?.phone) setPhone(profile.phone.replace(/\D/g, '').slice(-9))
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default,coordinates_lat,coordinates_lng')
        .order('is_default', { ascending: false })
      setAddresses((addrs ?? []) as Address[])
      setAddressId((addrs ?? []).find((a) => a.is_default)?.id ?? addrs?.[0]?.id ?? null)
      setAuthReady(true)
    })
  }, [cart, confirmed, router, sheetOpen])

  useEffect(() => {
    if (mustPrepay && payment !== 'prepaid') setPayment('prepaid')
  }, [mustPrepay, payment])

  const selectedAddress = addresses.find((a) => a.id === addressId)
  const reference = deliveryMethod === 'delivery' ? (selectedAddress?.reference ?? manualRef) : ''

  // "¿Con cuánto pagarás?" (solo efectivo): Exacto = total (vuelto 0).
  const cashAmount =
    cashChoice === 'exact'
      ? total
      : cashChoice === 'custom'
        ? Number.parseFloat(cashCustom) || 0
        : Number(cashChoice)
  const cashChange = Math.round((cashAmount - total) * 100) / 100

  function goToPayment() {
    setError(null)
    if (name.trim().length === 0) {
      setError('Ingresa tu nombre')
      return
    }
    if (deliveryMethod === 'delivery' && reference.trim().length < 20) {
      setError('Elige o agrega una dirección con referencia de al menos 20 caracteres')
      return
    }
    if (!/^9\d{8}$/.test(phone)) {
      setError('Ingresa un celular válido (9 dígitos, empieza con 9)')
      return
    }
    setStep('payment')
  }

  async function collectGpsValidation(
    selectedPayment: PaymentIntent,
    skipGps: boolean,
  ): Promise<{ payload?: GpsValidationPayload; issue?: GeoBlockKind }> {
    if (deliveryMethod !== 'delivery') return {}
    if (skipGps) return { payload: { method: 'manual_skip_prepaid' } }

    try {
      const cfg = await getLocationValidation()
      const pos = await getPositionOnce(cfg.timeoutMs)
      const distance = haversineKm(
        { lat: pos.coords.latitude, lng: pos.coords.longitude },
        { lat: cfg.centerLat, lng: cfg.centerLng },
      )
      const accuracyM = pos.coords.accuracy
      const method = accuracyM > cfg.maxAccuracyM ? 'gps_low_accuracy' : 'gps_high_accuracy'

      if (accuracyM > cfg.maxAccuracyM && selectedPayment !== 'prepaid') {
        return { issue: 'low_accuracy' }
      }
      if (distance > cfg.warningRadiusKm && selectedPayment !== 'prepaid') {
        return { issue: 'far' }
      }

      return {
        payload: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM,
          distanceToCenterKm: Math.round(distance * 1000) / 1000,
          method,
        },
      }
    } catch {
      if (selectedPayment === 'prepaid') return { payload: { method: 'manual_skip_prepaid' } }
      return { issue: 'unavailable' }
    }
  }

  async function placeOrder(options?: { paymentIntent?: PaymentIntent; skipGps?: boolean }) {
    const selectedPayment = options?.paymentIntent ?? payment
    setError(null)
    if (selectedPayment === 'pending_cash' && cashAmount < total) {
      setError('El monto con el que pagarás debe cubrir el total del pedido')
      return
    }
    setLoading(true)
    let gpsPayload: GpsValidationPayload | undefined

    // GPS antifraude: ubicación normal continúa, zona de advertencia va a
    // validación manual, y GPS fallido/incierto permite continuar con prepago.
    setLocating(true)
    try {
      const gps = await collectGpsValidation(selectedPayment, Boolean(options?.skipGps))
      if (gps.issue) {
        setGeoBlock(gps.issue)
        setLoading(false)
        return
      }
      gpsPayload = gps.payload
    } catch {
      // PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT / sin API.
      setGeoBlock('unavailable')
      setLoading(false)
      return
    } finally {
      setLocating(false)
    }

    try {
      const res = await api.post<{ data: OrderResult }>(
        '/customer/orders',
        {
          businessId: cart.businessId,
          deliveryMethod,
          paymentIntent: selectedPayment,
          customerName: name.trim() || 'Cliente',
          customerPhone: phone,
          cashPayingWith:
            selectedPayment === 'pending_cash' ? Math.round(cashAmount * 100) / 100 : undefined,
          deliveryAddress: selectedAddress?.line ?? undefined,
          deliveryReference: deliveryMethod === 'delivery' ? reference : undefined,
          coordinates:
            deliveryMethod === 'delivery' && selectedAddress?.coordinates_lat != null
              ? {
                  lat: Number(selectedAddress.coordinates_lat),
                  lng: Number(selectedAddress.coordinates_lng),
                }
              : undefined,
          gpsValidation: gpsPayload,
          items: cart.lines.map((l) => ({
            menuItemId: l.itemId,
            quantity: l.quantity,
            note: l.note ?? undefined,
            modifiers: l.modifiers.map((m) => m.optionId),
          })),
        },
        idempotencyKey,
      )
      setConfirmed(res.data)
      cart.clear()
    } catch (err) {
      if (err instanceof ApiError && /bloquead/i.test(err.problem.detail ?? '')) {
        setBlocked(true)
        return
      }
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo crear el pedido',
      )
      setLoading(false)
    }
  }

  if (blocked) return <Blocked />
  if (geoBlock)
    return (
      <GeoBlocked
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
  if (confirmed)
    return confirmed.status === 'validando' && payment === 'prepaid' ? (
      <Prepay result={confirmed} />
    ) : (
      <Confirmed result={confirmed} />
    )
  if (!authReady)
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16">
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      </main>
    )

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-28">
      <ScreenHeader
        title={step === 'delivery' ? 'Datos de entrega' : 'Método de pago'}
        onBack={() => (step === 'payment' ? setStep('delivery') : router.back())}
      />

      <div className="px-4 pt-3">
        {step === 'delivery' ? (
          <>
            {PICKUP_ENABLED && (
              <Segmented
                value={deliveryMethod}
                onChange={setDeliveryMethod}
                options={[
                  { value: 'delivery' as DeliveryMethod, label: 'Delivery', icon: <Icon.Truck /> },
                  { value: 'pickup' as DeliveryMethod, label: 'Recojo', icon: <Icon.Store /> },
                ]}
              />
            )}

            {deliveryMethod === 'delivery' && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="t-field-label mb-0">Entregar en</span>
                  <Link href="/cuenta" className="font-semibold text-[13px] text-brand">
                    + Añadir nueva
                  </Link>
                </div>
                <div className="mt-2 flex flex-col gap-2.5">
                  {addresses.map((a) => {
                    const sel = a.id === addressId
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAddressId(a.id)}
                        className="flex items-start gap-3 rounded-[18px] bg-white p-3.5 text-left"
                        style={{
                          border: sel ? '2px solid #F97316' : '1px solid rgba(26,22,20,0.05)',
                        }}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                          style={{ background: 'rgba(249,115,22,0.1)' }}
                        >
                          {labelEmoji(a.label)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[14px]">{a.label}</span>
                            {a.is_default && (
                              <span
                                className="rounded-[5px] px-1.5 py-0.5 font-bold text-[9px] uppercase"
                                style={{ color: '#F97316', background: 'rgba(249,115,22,0.1)' }}
                              >
                                Por defecto
                              </span>
                            )}
                          </div>
                          {a.line && (
                            <div className="text-[13px]" style={{ color: 'rgba(26,22,20,0.7)' }}>
                              {a.line}
                            </div>
                          )}
                          <div
                            className="mt-0.5 text-[12px]"
                            style={{ color: 'rgba(26,22,20,0.55)' }}
                          >
                            {a.reference}
                          </div>
                        </div>
                        {sel && (
                          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                            <Icon.Check />
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {addresses.length === 0 && (
                    <label className="block">
                      <span className="t-field-label">Referencia de entrega (mín. 20)</span>
                      <textarea
                        className="t-field"
                        placeholder="Casa azul de dos pisos, frente al parque, portón negro"
                        value={manualRef}
                        onChange={(e) => setManualRef(e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <p
                  className="mt-2.5 flex items-start gap-2 text-[12px]"
                  style={{ color: 'rgba(26,22,20,0.55)' }}
                >
                  <span className="mt-0.5 shrink-0">
                    <Icon.Pin />
                  </span>
                  Solo entregamos en la cobertura de San Jacinto. Las direcciones se validan al
                  confirmar.
                </p>
              </div>
            )}

            {/* Datos del usuario: precargados del onboarding, editables aquí. */}
            <label className="mt-5 block">
              <span className="t-field-label">
                Nombre <span style={{ color: '#F97316' }}>*</span>
              </span>
              <input
                className="t-field"
                placeholder="Tu nombre"
                value={name}
                maxLength={120}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="mt-4 block">
              <span className="t-field-label">
                Teléfono de contacto <span style={{ color: '#F97316' }}>*</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-2xl border border-border bg-white px-3 py-3.5 font-mono text-[15px]"
                  style={{ color: 'rgba(26,22,20,0.6)' }}
                >
                  +51
                </span>
                <input
                  className="t-field"
                  inputMode="numeric"
                  placeholder="987654321"
                  value={phone}
                  maxLength={9}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </label>

            <label className="mt-4 block">
              <span className="t-field-label">Nota adicional (opcional)</span>
              <textarea
                className="t-field"
                placeholder="¿Alguna indicación? Ej. sin cebolla, extra salsa…"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <OrderDetail />

            <Summary
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              total={total}
              count={cart.count()}
            />
          </>
        ) : (
          <>
            {mustPrepay && (
              <p
                className="rounded-xl px-3 py-2.5 text-[13px]"
                style={{ background: 'rgba(249,115,22,0.08)', color: '#C2410C' }}
              >
                {amountRequiresPrepay
                  ? `Los pedidos de ${soles(prepayThreshold)} o más requieren pago anticipado con billetera digital.`
                  : 'Por políticas del servicio, este pedido requiere pago anticipado con billetera digital.'}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2.5">
              {[
                {
                  v: 'pending_cash' as PaymentIntent,
                  label: 'Efectivo al recibir',
                  desc: 'Paga en efectivo al motorizado',
                },
                {
                  v: 'pending_yape' as PaymentIntent,
                  label: 'Billetera digital al recibir',
                  desc: 'Paga con tu billetera digital al recibir',
                },
                {
                  v: 'prepaid' as PaymentIntent,
                  label: 'Prepago con billetera digital',
                  desc: 'Paga ahora y sube tu comprobante',
                },
              ].map((opt) => {
                const disabled = mustPrepay && opt.v !== 'prepaid'
                const sel = payment === opt.v
                return (
                  <button
                    key={opt.v}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setPayment(opt.v)
                      if (opt.v !== 'pending_cash') {
                        setCashChoice('exact')
                        setCashCustom('')
                      }
                    }}
                    className="flex items-center gap-3 rounded-[18px] bg-white p-4 text-left disabled:opacity-40"
                    style={{ border: sel ? '2px solid #F97316' : '1px solid rgba(26,22,20,0.05)' }}
                  >
                    <span
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                      style={{ border: `2px solid ${sel ? '#F97316' : 'rgba(26,22,20,0.25)'}` }}
                    >
                      {sel && (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: '#F97316' }}
                        />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-[15px]">{opt.label}</span>
                      <span className="block text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                        {opt.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {payment === 'pending_cash' && (
              <div
                className="mt-3 rounded-[18px] bg-white p-4"
                style={{ border: '1px solid rgba(26,22,20,0.05)' }}
              >
                <div className="font-semibold text-[15px]">¿Con cuánto pagarás?</div>
                <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                  Así el motorizado lleva tu vuelto exacto.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {CASH_CHIPS.filter((c) => c.amount === null || c.amount >= total).map((c) => {
                    const sel = cashChoice === c.value
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCashChoice(c.value)}
                        className="rounded-full px-3.5 py-2 font-semibold text-[13px]"
                        style={
                          sel
                            ? { background: '#F97316', color: '#fff' }
                            : {
                                background: 'rgba(26,22,20,0.04)',
                                border: '1px solid rgba(26,22,20,0.08)',
                              }
                        }
                      >
                        {c.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCashChoice('custom')}
                    className="rounded-full px-3.5 py-2 font-semibold text-[13px]"
                    style={
                      cashChoice === 'custom'
                        ? { background: '#F97316', color: '#fff' }
                        : {
                            background: 'rgba(26,22,20,0.04)',
                            border: '1px solid rgba(26,22,20,0.08)',
                          }
                    }
                  >
                    Otro monto
                  </button>
                </div>
                {cashChoice === 'custom' && (
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className="rounded-2xl border border-border bg-white px-3 py-3.5 font-mono text-[15px]"
                      style={{ color: 'rgba(26,22,20,0.6)' }}
                    >
                      S/
                    </span>
                    <input
                      className="t-field"
                      inputMode="decimal"
                      placeholder={total.toFixed(2)}
                      value={cashCustom}
                      maxLength={7}
                      onChange={(e) => setCashCustom(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                )}
                <p
                  className="mt-3 text-[13px] font-medium tabular-nums"
                  style={{ color: cashAmount >= total ? '#1A8050' : '#DC2626' }}
                >
                  {cashAmount >= total
                    ? cashChange > 0
                      ? `Tu vuelto: ${soles(cashChange)}`
                      : 'Pago exacto, sin vuelto.'
                    : `El monto debe cubrir el total (${soles(total)})`}
                </p>
              </div>
            )}

            <Summary
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              total={total}
              count={cart.count()}
            />
          </>
        )}

        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
      </div>

      <div className="t-sticky-cta mx-auto max-w-[768px]">
        {step === 'delivery' ? (
          <button type="button" className="t-btn t-btn-primary t-btn-block" onClick={goToPayment}>
            Revisar y pagar · {soles(total)}
          </button>
        ) : (
          <button
            type="button"
            className="t-btn t-btn-primary t-btn-block"
            disabled={loading}
            onClick={() => void placeOrder()}
          >
            {locating
              ? 'Verificando ubicación…'
              : loading
                ? 'Enviando…'
                : `Confirmar pedido · ${soles(total)}`}
          </button>
        )}
      </div>
    </main>
  )
}

/** Detalle colapsable del carrito: líneas con adicionales, nota, cantidad y eliminar. */
function OrderDetail() {
  const cart = useCart()
  const [open, setOpen] = useState(false)
  const count = cart.count()
  if (count === 0) return null

  return (
    <div
      className="mt-5 overflow-hidden rounded-[22px] bg-white"
      style={{ border: '1px solid rgba(26,22,20,0.05)' }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: 'rgba(26,22,20,0.05)' }}
        >
          <Icon.Bag />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-[15px]">Detalle del pedido</span>
          <span className="block text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {count} {count === 1 ? 'producto' : 'productos'}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(-90deg)',
            transition: 'transform 200ms ease',
            color: 'rgba(26,22,20,0.4)',
            display: 'inline-flex',
          }}
        >
          <Icon.Back />
        </span>
      </button>

      {open && (
        <div className="border-t px-4 pb-4" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
          {cart.lines.map((line, i) => (
            <div
              key={line.key}
              className="pt-3.5"
              style={{
                borderTop: i > 0 ? '1px solid rgba(26,22,20,0.05)' : 'none',
                marginTop: i > 0 ? 14 : 0,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[14px]">
                    <span className="tabular-nums">{line.quantity}×</span> {line.name}
                  </div>
                  {line.modifiers.map((m) => (
                    <div
                      key={`${line.key}-${m.optionId}`}
                      className="mt-0.5 flex justify-between text-[12px]"
                      style={{ color: 'rgba(26,22,20,0.55)' }}
                    >
                      <span>{m.optionName}</span>
                      {m.price > 0 && <span className="tabular-nums">+{soles(m.price)}</span>}
                    </div>
                  ))}
                  {line.note && (
                    <div
                      className="mt-0.5 text-[12px] italic"
                      style={{ color: 'rgba(26,22,20,0.45)' }}
                    >
                      “{line.note}”
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-semibold text-[14px] tabular-nums">
                  {soles(line.unitPrice * line.quantity)}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="t-qty" style={{ transform: 'scale(0.9)', transformOrigin: 'left' }}>
                  <button
                    type="button"
                    onClick={() => cart.setQty(line.key, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                    aria-label="Menos"
                  >
                    <Icon.Minus />
                  </button>
                  <span className="val">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => cart.setQty(line.key, line.quantity + 1)}
                    aria-label="Más"
                  >
                    <Icon.Plus />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(line.key)}
                  className="rounded-lg px-2.5 py-1.5 font-medium text-[12px]"
                  style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
    <div
      className="mt-5 rounded-[22px] bg-white p-4"
      style={{ border: '1px solid rgba(26,22,20,0.05)' }}
    >
      <div className="t-eyebrow mb-2.5">Resumen</div>
      <Row label={`Productos (${count})`} value={soles(subtotal)} />
      <Row label="Delivery" value={soles(deliveryFee)} />
      <div className="my-2.5 h-px" style={{ background: 'rgba(26,22,20,0.08)' }} />
      <Row label="Total a pagar" value={soles(total)} big />
    </div>
  )
}
function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div
      className="flex justify-between py-1 tabular-nums"
      style={{
        fontSize: big ? 17 : 14,
        fontWeight: big ? 700 : 500,
        color: big ? '#1A1614' : 'rgba(26,22,20,0.7)',
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  total: number
  hasProof: boolean
}

function Prepay({ result }: { result: OrderResult }) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [seconds, setSeconds] = useState(600)
  const [sent, setSent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El comprobante se previsualiza antes de enviarse (envío explícito).
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ApiEnvelope<PrepayInfo>>(`/customer/orders/${result.id}/prepay-info`)
      .then((r) => {
        setInfo(r.data)
        if (r.data.hasProof) setSent(true)
      })
      .catch(() => {})
  }, [result.id])

  useEffect(() => {
    if (sent) return
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [sent])

  // Liberar el object URL del preview al desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setPendingFile(file)
    // Permite re-seleccionar el mismo archivo tras "Cambiar imagen".
    e.target.value = ''
  }

  async function submitProof() {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    const path = `${userId}/${result.id}`
    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }
    try {
      await api.post(`/customer/orders/${result.id}/prepay-proof`, { path })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setUploading(false)
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const expired = seconds === 0 && !sent
  const danger = seconds <= 60 && !sent

  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-4 pt-10 pb-12">
      <h1 className="t-display text-[26px]">Paga con billetera digital</h1>
      <p className="t-muted mt-1 text-[14px]">Pedido #{result.shortId}</p>

      {sent ? (
        <div
          className="mt-6 rounded-[18px] bg-white p-5 text-center"
          style={{ border: '1px solid rgba(26,22,20,0.06)' }}
        >
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
            style={{ background: '#1A8050' }}
          >
            <Icon.Check />
          </div>
          <p className="t-display mt-3 text-[18px]">Comprobante enviado</p>
          <p className="t-muted mt-1 text-[14px]">
            El restaurante validará tu pago y confirmará el pedido.
          </p>
          <Link href={`/pedido/${result.shortId}`} className="t-btn t-btn-primary t-btn-block mt-5">
            Ver seguimiento
          </Link>
        </div>
      ) : (
        <>
          <div
            className="mt-4 flex items-center justify-between rounded-[18px] px-4 py-3.5"
            style={{ background: danger ? 'rgba(220,38,38,0.08)' : 'rgba(249,115,22,0.08)' }}
          >
            <span className="text-[14px]" style={{ color: danger ? '#DC2626' : '#C2410C' }}>
              {expired ? 'Tiempo agotado' : 'Tiempo para pagar'}
            </span>
            <span
              className="font-mono font-bold text-[22px] tabular-nums"
              style={{ color: danger ? '#DC2626' : '#C2410C' }}
            >
              {mm}:{ss}
            </span>
          </div>

          <div
            className="mt-4 rounded-[18px] bg-white p-5"
            style={{ border: '1px solid rgba(26,22,20,0.06)' }}
          >
            <p className="t-eyebrow">Paga a {info?.businessName ?? 'el restaurante'}</p>
            {info?.qrUrl && (
              <div className="mt-3 flex justify-center">
                <img
                  src={info.qrUrl}
                  alt={`QR de pago de ${info.businessName}`}
                  className="rounded-2xl"
                  style={{
                    width: 180,
                    height: 180,
                    objectFit: 'contain',
                    border: '1px solid rgba(26,22,20,0.08)',
                    background: '#fff',
                  }}
                />
              </div>
            )}
            <p className="mt-1 font-mono font-semibold text-[24px]">{info?.yapeNumber ?? '…'}</p>
            <p className="mt-1 text-[15px]">
              Monto: <span className="font-semibold">{soles(info?.total ?? result.total)}</span>
            </p>
            <ol className="mt-3 space-y-1.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.7)' }}>
              <li>
                1. Abre tu billetera digital y {info?.qrUrl ? 'escanea el QR o envía' : 'envía'} el
                monto exacto al número de arriba.
              </li>
              <li>2. Toma captura del comprobante.</li>
              <li>3. Súbela aquí abajo para confirmar tu pedido.</li>
            </ol>
          </div>

          {error && <p className="mt-3 text-danger text-sm">{error}</p>}

          {previewUrl ? (
            <div
              className="mt-5 rounded-[18px] bg-white p-4"
              style={{ border: '1px solid rgba(26,22,20,0.06)' }}
            >
              <p className="t-eyebrow">Tu comprobante</p>
              <img
                src={previewUrl}
                alt="Vista previa del comprobante"
                className="mt-2 w-full rounded-xl"
                style={{ maxHeight: 280, objectFit: 'contain', background: 'rgba(26,22,20,0.04)' }}
              />
              <div className="mt-3 flex gap-2.5">
                <label
                  className="flex-1 cursor-pointer rounded-[14px] px-4 py-3 text-center font-semibold text-[14px]"
                  style={{ background: 'rgba(26,22,20,0.06)' }}
                >
                  Cambiar imagen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFile}
                    disabled={uploading || expired}
                  />
                </label>
                <button
                  type="button"
                  className="t-btn t-btn-primary flex-1"
                  disabled={uploading || expired}
                  onClick={submitProof}
                >
                  {uploading ? 'Enviando…' : 'Enviar comprobante'}
                </button>
              </div>
            </div>
          ) : (
            <label className="t-btn t-btn-primary t-btn-block mt-5 cursor-pointer">
              Subir comprobante
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
                disabled={uploading || expired}
              />
            </label>
          )}
          <Link
            href={`/pedido/${result.shortId}`}
            className="mt-3 block text-center text-[14px] text-brand"
          >
            Ver seguimiento
          </Link>
        </>
      )}
    </main>
  )
}

function Confirmed({ result }: { result: OrderResult }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-white"
        style={{ background: '#1A8050' }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>ok</title>
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[28px]">¡Pedido recibido!</h1>
      <p className="t-muted mt-2 text-[15px]">Esperando que el restaurante confirme tu pedido.</p>
      <div
        className="mt-5 rounded-[18px] bg-white px-6 py-4"
        style={{ border: '1px solid rgba(26,22,20,0.06)' }}
      >
        <div className="t-eyebrow">Código del pedido</div>
        <div className="mt-1 font-mono font-semibold text-[24px]">#{result.shortId}</div>
      </div>
      <Link href={`/pedido/${result.shortId}`} className="t-btn t-btn-primary t-btn-block mt-6">
        Ver seguimiento
      </Link>
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}

/** Fallback antifraude por GPS: reintentar o continuar con pago anticipado. */
function GeoBlocked({
  kind,
  onRetry,
  onPrepay,
}: {
  kind: GeoBlockKind
  onRetry: () => void
  onPrepay: () => void
}) {
  const copy = {
    far: {
      title: 'Este pedido requiere pago anticipado',
      body: 'Detectamos que estás fuera de la zona normal de validación. Puedes continuar pagando por adelantado.',
      color: '#C2410C',
    },
    unavailable: {
      title: 'No pudimos detectar tu ubicación',
      body: 'Revisa el permiso de ubicación de tu navegador. Si prefieres, puedes continuar con pago anticipado.',
      color: '#F97316',
    },
    low_accuracy: {
      title: 'La ubicación no fue precisa',
      body: 'Tu navegador entregó una ubicación imprecisa. Reintenta desde un lugar con mejor señal o paga por adelantado.',
      color: '#F59E0B',
    },
  }[kind]
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-white"
        style={{ background: copy.color }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>ubicación</title>
          <path
            d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[26px]">{copy.title}</h1>
      <p className="t-muted mt-2 text-[15px]">{copy.body}</p>
      <button type="button" onClick={onPrepay} className="t-btn t-btn-primary t-btn-block mt-6">
        Pagar por adelantado
      </button>
      <button type="button" onClick={onRetry} className="t-btn t-btn-ghost t-btn-block mt-3">
        Volver a intentar
      </button>
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}

function Blocked() {
  const wa = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
  const href = wa
    ? `https://wa.me/${wa.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, mi cuenta aparece pausada y quiero regularizarla.')}`
    : undefined
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-white"
        style={{ background: '#DC2626' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>pausa</title>
          <path
            d="M6 10V8a6 6 0 0112 0v2m-9 0h6a3 3 0 013 3v4a3 3 0 01-3 3H9a3 3 0 01-3-3v-4a3 3 0 013-3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[26px]">Cuenta en pausa</h1>
      <p className="t-muted mt-2 text-[15px]">
        Tu cuenta está temporalmente pausada por incidentes reiterados en las entregas. Escríbenos
        para regularizar tu situación y reactivarla.
      </p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="t-btn t-btn-primary t-btn-block mt-6"
        >
          Escribir por WhatsApp
        </a>
      )}
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
