'use client'

import { ApiError } from '@tindivo/api-client'
import { BLACKLISTED_PHONES } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { api } from '@/lib/api'

const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]
type Payment = 'pending_cash' | 'pending_wallet' | 'prepaid' | 'pending_mixed'

interface IntakeStatus {
  isOpen: boolean
  cutoff: string
  startTime?: string
  serverTimeLima: string
  message: string | null
}

const PAYMENTS: { id: Payment; icon: string; label: string; sub: string }[] = [
  {
    id: 'pending_cash',
    icon: 'payments',
    label: 'Efectivo',
    sub: 'El motorizado cobra en efectivo',
  },
  {
    id: 'pending_wallet',
    icon: 'qr_code_2',
    label: 'Billetera digital',
    sub: 'Yape, Plin u otra — el moto muestra QR',
  },
  {
    id: 'prepaid',
    icon: 'verified',
    label: 'Ya pagó',
    sub: 'El cliente ya realizó la transferencia',
  },
  {
    id: 'pending_mixed',
    icon: 'shuffle',
    label: 'Mixto',
    sub: 'Una parte con billetera, otra en efectivo',
  },
]

function num(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function getOrCreateIdempotencyKey(): string {
  if (typeof window === 'undefined') return ''
  let key = sessionStorage.getItem('tindivo:new-order-key')
  if (!key) {
    key =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `key-${Date.now()}-${Math.random()}`
    sessionStorage.setItem('tindivo:new-order-key', key)
  }
  return key
}

function clearIdempotencyKey(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('tindivo:new-order-key')
  }
}

function regenerateIdempotencyKey(): string {
  clearIdempotencyKey()
  return getOrCreateIdempotencyKey()
}

function isReferenceValid(reference: string, deliveryMethod: string): boolean {
  if (deliveryMethod !== 'delivery') return true
  return reference.trim().length >= 5
}

function mapFormError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    if (
      err instanceof Error &&
      (err.message.includes('fetch') || err.message.includes('network'))
    ) {
      return 'Error de conexión con el servidor. Tu borrador se mantiene intacto. Vuelve a intentar.'
    }
    return 'No se pudo crear el pedido. Intenta nuevamente.'
  }

  const detail = (err.problem?.detail ?? err.message ?? '').toLowerCase()

  if (detail.includes('suspendida') || detail.includes('is_blocked')) {
    return 'Cuenta de negocio suspendida. Contacta a soporte de Tindivo.'
  }
  if (detail.includes('inactivo') || detail.includes('is_active')) {
    return 'Tu negocio no está activo en este momento.'
  }
  if (detail.includes('prueba') || detail.includes('blacklisted')) {
    return 'Número de teléfono de prueba no permitido.'
  }
  if (detail.includes('bloqueado') || detail.includes('customer_is_blocked')) {
    return 'El cliente se encuentra bloqueado por políticas de seguridad.'
  }
  if (detail.includes('anticipado') || detail.includes('prepayment')) {
    return 'Este cliente requiere pago por adelantado (prepago).'
  }
  if (
    detail.includes('cerrado') ||
    detail.includes('horario') ||
    detail.includes('plataforma') ||
    detail.includes('22:30') ||
    detail.includes('reciben pedidos')
  ) {
    return err.problem?.detail ?? 'Ya no se reciben pedidos. El horario de atención ha finalizado.'
  }

  return err.problem?.detail ?? 'No se pudo procesar la solicitud.'
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const submittingRef = useRef(false)

  const [prep, setPrep] = useState(20)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<Payment>('pending_cash')
  const [amount, setAmount] = useState('')
  const [paysWith, setPaysWith] = useState('')
  const [walletPart, setWalletPart] = useState('')
  const [cashPart, setCashPart] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus | null>(null)

  useEffect(() => {
    let unmounted = false
    api
      .get<IntakeStatus>('/public/schedule')
      .then((data) => {
        if (!unmounted && data) setIntakeStatus(data)
      })
      .catch(() => {})
    return () => {
      unmounted = true
    }
  }, [])

  const deliveryMethod = 'delivery'
  const amountN = num(amount)
  const cleanPhone = phone.replace(/\D/g, '')

  const isIntakeOpen = intakeStatus?.isOpen ?? true
  const startTime = intakeStatus?.startTime ?? '18:00'
  const cutoffTime = intakeStatus?.cutoff ?? '22:30'
  const cutoffBannerMessage =
    intakeStatus?.message ??
    `Recibimos pedidos de ${startTime} a ${cutoffTime}. Vuelve dentro del horario.`

  // 1. Blacklist check
  const isPhoneBlacklisted = cleanPhone.length > 0 && BLACKLISTED_PHONES.includes(cleanPhone as any)
  const phoneFormatOk = cleanPhone === '' || /^9\d{8}$/.test(cleanPhone)
  const phoneOk = phoneFormatOk && !isPhoneBlacklisted

  // 2. Reference validation (conditional to deliveryMethod)
  const referenceOk = isReferenceValid(reference, deliveryMethod)

  // 3. Mixed payment integer cents validation
  const centsTotal = Math.round(amountN * 100)
  const centsWallet = Math.round(num(walletPart) * 100)
  const centsCash = Math.round(num(cashPart) * 100)
  const mixedOk = payment !== 'pending_mixed' || centsWallet + centsCash === centsTotal

  const isCashish = payment === 'pending_cash' || payment === 'pending_mixed'
  const cashTarget = payment === 'pending_mixed' ? num(cashPart) : amountN
  const change = useMemo(() => {
    if (!isCashish) return 0
    const c = num(paysWith) - cashTarget
    return c > 0 ? c : 0
  }, [isCashish, paysWith, cashTarget])

  const canSubmit = amountN > 0 && mixedOk && phoneOk && referenceOk && !busy

  async function submit() {
    if (submittingRef.current || !canSubmit) return
    submittingRef.current = true
    setBusy(true)
    setError(null)

    const idempotencyKey = getOrCreateIdempotencyKey()
    const orderPayload = {
      deliveryMethod,
      paymentIntent: payment === 'pending_wallet' ? 'pending_yape' : payment,
      customerName: name.trim() || undefined,
      customerPhone: cleanPhone || undefined,
      deliveryReference: reference.trim() || undefined,
      prepTimeMinutes: prep,
      orderAmount: amountN,
      clientPaysWith: isCashish && num(paysWith) > 0 ? num(paysWith) : undefined,
      yapeAmount: payment === 'pending_mixed' ? num(walletPart) : undefined,
      cashAmount: payment === 'pending_mixed' ? num(cashPart) : undefined,
    }

    try {
      await api.post('/business/orders', orderPayload, idempotencyKey)
      clearIdempotencyKey()
      router.replace('/')
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'idempotency_conflict' ||
          (err.status === 409 && err.message.toLowerCase().includes('idempotency'))
        ) {
          const freshKey = regenerateIdempotencyKey()
          try {
            await api.post('/business/orders', orderPayload, freshKey)
            clearIdempotencyKey()
            router.replace('/')
            return
          } catch (retryErr) {
            if (retryErr instanceof ApiError && retryErr.status >= 400 && retryErr.status < 500) {
              regenerateIdempotencyKey()
            }
            setError(mapFormError(retryErr))
            setBusy(false)
            submittingRef.current = false
            return
          }
        }
        if (err.status >= 400 && err.status < 500) {
          // 4xx error (400, 403, 409 validation, 422) -> regenerar clave (el servidor no creó nada)
          regenerateIdempotencyKey()
        }
      }
      setError(mapFormError(err))
      setBusy(false)
      submittingRef.current = false
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: 'var(--tv-surface)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px 12px',
          background: '#fff',
          borderBottom: '1px solid var(--tv-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={() => router.replace('/')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(26,22,20,0.06)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MS name="arrow_back" size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="tv-display" style={{ fontSize: 18, lineHeight: 1.1 }}>
            Solicitar motorizado
          </div>
          <div className="tv-label" style={{ marginTop: 2 }}>
            PEDIDO POR TELÉFONO
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px 140px',
          maxWidth: 560,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 1 · Prep */}
        <div style={card}>
          <div className="tv-label-input">TIEMPO DE PREPARACIÓN</div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              padding: '2px 0 6px',
            }}
          >
            {PREP_PRESETS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setPrep(m)}
                style={{
                  flexShrink: 0,
                  minWidth: 52,
                  border: m === prep ? 'none' : '1px solid var(--tv-border)',
                  background: m === prep ? 'var(--tv-ink)' : '#fff',
                  color: m === prep ? '#fff' : 'var(--tv-ink)',
                  fontFamily: "var(--font-jetbrains), 'Manrope', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 0',
                  borderRadius: 12,
                  cursor: 'pointer',
                }}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        {/* 2 · Cliente */}
        <div style={card}>
          <div className="tv-label" style={{ marginBottom: 10 }}>
            DATOS DEL CLIENTE
          </div>
          <div style={{ marginBottom: 10 }}>
            <div className="tv-label-input">NOMBRE (OPCIONAL)</div>
            <input
              className="tv-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="María Quispe"
            />
          </div>
          <div>
            <div className="tv-label-input">TELÉFONO (OPCIONAL)</div>
            <input
              className="tv-input tv-mono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="987 654 321"
              inputMode="numeric"
            />
            {isPhoneBlacklisted && (
              <div style={{ fontSize: 11, color: 'var(--tv-danger)', marginTop: 4 }}>
                Número de teléfono de prueba no permitido.
              </div>
            )}
            {!phoneFormatOk && !isPhoneBlacklisted && (
              <div style={{ fontSize: 11, color: 'var(--tv-danger)', marginTop: 4 }}>
                Debe tener 9 dígitos y empezar por 9.
              </div>
            )}
          </div>
        </div>

        {/* 3 · Dirección o referencia */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="tv-label" style={{ flex: 1 }}>
              DIRECCIÓN O REFERENCIA
            </div>
            <span className="tv-mono" style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>
              {reference.length}/500
            </span>
          </div>
          <textarea
            className="tv-input"
            style={{ minHeight: 80, resize: 'none', lineHeight: 1.5 }}
            maxLength={500}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy"
          />
          {deliveryMethod === 'delivery' &&
            reference.trim().length > 0 &&
            reference.trim().length < 5 && (
              <div style={{ fontSize: 11, color: 'var(--tv-danger)', marginTop: 4 }}>
                La referencia debe tener al menos 5 caracteres.
              </div>
            )}
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
            El motorizado verá este texto en su app al recoger el pedido.
          </div>
        </div>

        {/* 4 · Pago */}
        <div style={card}>
          <div className="tv-label" style={{ marginBottom: 10 }}>
            MÉTODO DE PAGO
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PAYMENTS.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => setPayment(o.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 14,
                  cursor: 'pointer',
                  background: '#fff',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  border:
                    payment === o.id ? '2px solid var(--tv-ink)' : '1px solid var(--tv-border)',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: payment === o.id ? 'var(--tv-ink)' : 'rgba(26,22,20,0.06)',
                    color: payment === o.id ? '#fff' : 'var(--tv-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MS name={o.icon} size={20} filled={payment === o.id} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
                    {o.sub}
                  </div>
                </div>
                {payment === o.id && (
                  <MS name="check_circle" size={20} filled style={{ color: 'var(--tv-brand)' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 5 · Monto */}
        {payment !== 'prepaid' ? (
          <div style={card}>
            <div className="tv-label" style={{ marginBottom: 10 }}>
              MONTO DEL PEDIDO
            </div>
            <div className="tv-label-input">TOTAL DEL PEDIDO (S/)</div>
            <input
              className="tv-input tv-mono"
              style={{ fontSize: 20, fontWeight: 700 }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
              No necesitas desglosar los platos. Solo el total que el cliente debe.
            </div>

            {payment === 'pending_mixed' && (
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}
              >
                <div>
                  <div className="tv-label-input">BILLETERA (S/)</div>
                  <input
                    className="tv-input tv-mono"
                    value={walletPart}
                    onChange={(e) => setWalletPart(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="tv-label-input">EFECTIVO (S/)</div>
                  <input
                    className="tv-input tv-mono"
                    value={cashPart}
                    onChange={(e) => setCashPart(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div
                  style={{
                    gridColumn: '1/-1',
                    fontSize: 12,
                    color: mixedOk ? 'var(--tv-success)' : 'var(--tv-danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <MS name={mixedOk ? 'check_circle' : 'error'} size={14} filled />
                  {mixedOk
                    ? `${soles(num(walletPart))} + ${soles(num(cashPart))} = ${soles(amountN)} · suma correcta`
                    : 'La suma de billetera + efectivo debe igualar el total'}
                </div>
              </div>
            )}

            {isCashish && (
              <div style={{ marginTop: 10 }}>
                <div className="tv-label-input">CLIENTE PAGA CON (S/)</div>
                <input
                  className="tv-input tv-mono"
                  style={{ fontSize: 20, fontWeight: 700 }}
                  value={paysWith}
                  onChange={(e) => setPaysWith(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
            )}

            {isCashish && change > 0 && (
              <div
                style={{
                  marginTop: 12,
                  background: '#DCFCE7',
                  color: '#14532D',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <MS
                  name="payments"
                  size={22}
                  filled
                  style={{ color: '#16A34A', flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                    Entrega <span className="tv-mono">{soles(change)}</span> de vuelto al motorizado
                    junto con el pedido
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: '#E0F2FE',
              color: '#0369A1',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <MS name="verified" size={18} filled />
            <span>El cliente ya pagó — el motorizado solo entrega, no cobra.</span>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#FEE2E2',
              color: '#991B1B',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              marginTop: 8,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <MS name="error" size={18} filled style={{ color: '#DC2626' }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          background: '#fff',
          borderTop: '1px solid var(--tv-border)',
          padding: '12px 14px 16px',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
          position: 'sticky',
          bottom: 0,
        }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {isCashish && change > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                background: '#DCFCE7',
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <MS name="payments" size={16} filled style={{ color: '#16A34A' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
                Entrega {soles(change)} de vuelto al motorizado junto con el pedido
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="tv-btn tv-btn-brand tv-btn-block tv-btn-xl"
          >
            <MS name="two_wheeler" size={22} filled /> {busy ? 'Creando…' : 'Pedir moto'}
          </button>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '14px 16px',
  marginBottom: 12,
  border: '1px solid var(--tv-border)',
}
