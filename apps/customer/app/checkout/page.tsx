'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import type { DeliveryMethod, PaymentIntent } from '@tindivo/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icon, ScreenHeader, Segmented } from '@/components/ui'
import { api } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number) => `S/ ${n.toFixed(2)}`
const PREPAY_THRESHOLD = 100
const NEAR_DELIVERY_FEE = 2.0
const labelEmoji = (l: string) => (l === 'Casa' ? '🏠' : l === 'Trabajo' ? '💼' : '📍')

interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
}
interface OrderResult {
  id: string
  shortId: string
  status: string
  total: number
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<OrderResult | null>(null)

  const subtotal = cart.subtotal()
  const deliveryFee = deliveryMethod === 'pickup' ? 0 : NEAR_DELIVERY_FEE
  const total = useMemo(
    () => Math.round((subtotal + deliveryFee) * 100) / 100,
    [subtotal, deliveryFee],
  )
  const mustPrepay = subtotal >= PREPAY_THRESHOLD

  useEffect(() => {
    if (cart.count() === 0 && !confirmed) {
      router.replace('/')
      return
    }
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/entrar?next=/checkout')
        return
      }
      const meta = data.session.user.user_metadata as { full_name?: string } | undefined
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('full_name,phone')
        .maybeSingle()
      setName(prof?.full_name ?? meta?.full_name ?? '')
      if (prof?.phone) setPhone(prof.phone.replace(/\D/g, '').slice(-9))
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default')
        .order('is_default', { ascending: false })
      setAddresses((addrs ?? []) as Address[])
      setAddressId((addrs ?? []).find((a) => a.is_default)?.id ?? addrs?.[0]?.id ?? null)
      setAuthReady(true)
    })
  }, [cart, confirmed, router])

  useEffect(() => {
    if (mustPrepay && payment !== 'prepaid') setPayment('prepaid')
  }, [mustPrepay, payment])

  const selectedAddress = addresses.find((a) => a.id === addressId)
  const reference = deliveryMethod === 'delivery' ? (selectedAddress?.reference ?? manualRef) : ''

  function goToPayment() {
    setError(null)
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

  async function placeOrder() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<{ data: OrderResult }>(
        '/customer/orders',
        {
          businessId: cart.businessId,
          deliveryMethod,
          paymentIntent: payment,
          customerName: name.trim() || 'Cliente',
          customerPhone: phone,
          deliveryAddress: selectedAddress?.line ?? undefined,
          deliveryReference: deliveryMethod === 'delivery' ? reference : undefined,
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
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo crear el pedido',
      )
      setLoading(false)
    }
  }

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
            <Segmented
              value={deliveryMethod}
              onChange={setDeliveryMethod}
              options={[
                { value: 'delivery' as DeliveryMethod, label: 'Delivery', icon: <Icon.Truck /> },
                { value: 'pickup' as DeliveryMethod, label: 'Recojo', icon: <Icon.Store /> },
              ]}
            />

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

            <label className="mt-5 block">
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
                Los pedidos de S/100 a más se pagan por adelantado con Yape.
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
                  label: 'Yape al recibir',
                  desc: 'Yapea al motorizado al entregar',
                },
                {
                  v: 'prepaid' as PaymentIntent,
                  label: 'Yape por adelantado',
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
                    onClick={() => setPayment(opt.v)}
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
            onClick={placeOrder}
          >
            {loading ? 'Enviando…' : `Confirmar pedido · ${soles(total)}`}
          </button>
        )}
      </div>
    </main>
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
  total: number
  hasProof: boolean
}

function Prepay({ result }: { result: OrderResult }) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [seconds, setSeconds] = useState(600)
  const [sent, setSent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    const path = `${userId}/${result.id}`
    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { upsert: true, contentType: file.type })
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
      <h1 className="t-display text-[26px]">Paga por Yape</h1>
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
            <p className="t-eyebrow">Yapea a {info?.businessName ?? 'el restaurante'}</p>
            <p className="mt-1 font-mono font-semibold text-[24px]">{info?.yapeNumber ?? '…'}</p>
            <p className="mt-1 text-[15px]">
              Monto: <span className="font-semibold">{soles(info?.total ?? result.total)}</span>
            </p>
            <ol className="mt-3 space-y-1.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.7)' }}>
              <li>1. Abre Yape/Plin y envía el monto exacto al número de arriba.</li>
              <li>2. Toma captura del comprobante.</li>
              <li>3. Súbela aquí abajo para confirmar tu pedido.</li>
            </ol>
          </div>

          {error && <p className="mt-3 text-danger text-sm">{error}</p>}

          <label className="t-btn t-btn-primary t-btn-block mt-5 cursor-pointer">
            {uploading ? 'Subiendo…' : 'Subir comprobante'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFile}
              disabled={uploading || expired}
            />
          </label>
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
