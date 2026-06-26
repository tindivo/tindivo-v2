'use client'

import { ApiError } from '@tindivo/api-client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { api } from '@/lib/api'

const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]
type Payment = 'pending_cash' | 'pending_wallet' | 'prepaid' | 'pending_mixed'

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

export default function NuevoPedidoPage() {
  const router = useRouter()

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

  const amountN = num(amount)
  const isCashish = payment === 'pending_cash' || payment === 'pending_mixed'
  const cashTarget = payment === 'pending_mixed' ? num(cashPart) : amountN
  const change = useMemo(() => {
    if (!isCashish) return 0
    const c = num(paysWith) - cashTarget
    return c > 0 ? c : 0
  }, [isCashish, paysWith, cashTarget])

  const mixedOk =
    payment !== 'pending_mixed' || Math.abs(num(walletPart) + num(cashPart) - amountN) < 0.005
  const phoneOk = phone.trim() === '' || /^9\d{8}$/.test(phone.replace(/\D/g, ''))
  const canSubmit = amountN > 0 && mixedOk && phoneOk && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/business/orders', {
        deliveryMethod: 'delivery',
        paymentIntent: payment,
        customerName: name.trim() || undefined,
        customerPhone: phone.trim() ? phone.replace(/\D/g, '') : undefined,
        deliveryReference: reference.trim() || undefined,
        prepTimeMinutes: prep,
        orderAmount: amountN,
        clientPaysWith: isCashish && num(paysWith) > 0 ? num(paysWith) : undefined,
        yapeAmount: payment === 'pending_mixed' ? num(walletPart) : undefined,
        cashAmount: payment === 'pending_mixed' ? num(cashPart) : undefined,
      })
      router.replace('/')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo crear el pedido',
      )
      setBusy(false)
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
                  fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
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
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
            El motorizado llegará ~{prep + 5}–{prep + 15} min desde ahora.
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
            {!phoneOk && (
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
                  name="shopping_bag"
                  size={22}
                  filled
                  style={{ color: '#16A34A', flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                    Vuelto a entregar: <span className="tv-mono">{soles(change)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#166534' }}>
                    Prepáralo en efectivo y mételo en la bolsa antes de que llegue el motorizado.
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
          <div style={{ color: 'var(--tv-danger)', fontSize: 13, marginTop: 4, fontWeight: 600 }}>
            {error}
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
                Prepara vuelto de {soles(change)}
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
