'use client'

import { useState } from 'react'
import type { OrderVM } from '@/lib/orders/view-model'
import { MS, mmss, PayBadgeMini, SourceBadgeMini, soles } from './primitives'

export interface DetailItem {
  qty: number
  name: string
  mods: string | null
  note: string | null
  price: number
}

export type RejectReason = { code: string; label: string }

const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]

export interface DetailActions {
  onClose: () => void
  onAccept: (prepMinutes: number) => void | Promise<void>
  onReject: (code: string, text: string) => void | Promise<void>
  onVerifyProof: () => void | Promise<void>
  onRejectProof: () => void | Promise<void>
  onExtend: () => void | Promise<void>
  onReady: () => void | Promise<void>
  onCancel: (code: string, text: string) => void | Promise<void>
  onCallDriver?: () => void
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--tv-ink-muted)' }}>{label}</span>
      <span className={mono ? 'tv-mono' : ''} style={{ fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )
}

// ── Payment sections ──────────────────────────────────────────────────────────
function PaySectionCash({ order }: { order: OrderVM }) {
  return (
    <div
      style={{
        background: '#F0FDF4',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid #BBF7D0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="payments" size={18} filled style={{ color: '#16A34A' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Pago en efectivo</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Total a cobrar" value={soles(order.total)} mono bold />
        {order.paysWith != null && (
          <Row label="Cliente paga con" value={soles(order.paysWith)} mono />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#DCFCE7',
              borderRadius: 8,
              padding: '6px 10px',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
              Vuelto a preparar
            </span>
            <span className="tv-mono" style={{ fontSize: 16, fontWeight: 700, color: '#15803D' }}>
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function PaySectionWallet({ order, qrUrl }: { order: OrderVM; qrUrl: string | null }) {
  return (
    <div
      style={{
        background: '#F5F3FF',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid #DDD6FE',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="qr_code_2" size={18} filled style={{ color: '#7C3AED' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6' }}>
          Cobrar con billetera digital
        </div>
      </div>
      <Row label="Total a cobrar" value={soles(order.total)} mono bold />
      <div
        style={{
          marginTop: 10,
          background: '#fff',
          borderRadius: 10,
          padding: 10,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--tv-ink-muted)',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          QR del restaurante
        </div>
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="QR del restaurante"
            style={{
              width: 90,
              height: 90,
              borderRadius: 10,
              margin: '0 auto 8px',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            className="tv-ph"
            style={{ width: 90, height: 90, borderRadius: 10, margin: '0 auto 8px' }}
          >
            <span style={{ fontSize: 10 }}>QR Yape/Plin</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PaySectionPrepaid({
  order,
  proofUrl,
  onVerify,
  onReject,
}: {
  order: OrderVM
  proofUrl: string | null
  onVerify: () => void
  onReject: () => void
}) {
  const verified = order.proofStatus === 'verified'
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: verified ? '1.5px solid #4ADE80' : '1px solid #E0F2FE',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: verified ? '#F0FDF4' : '#E0F2FE',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <MS
          name={verified ? 'verified' : 'schedule'}
          size={18}
          filled
          style={{ color: verified ? '#16A34A' : '#0369A1' }}
        />
        <div style={{ fontSize: 13, fontWeight: 700, color: verified ? '#166534' : '#0C4A6E' }}>
          {verified ? 'Pago verificado' : 'Verificar comprobante de pago'}
        </div>
      </div>
      <div style={{ padding: '12px 14px', background: '#fff' }}>
        <Row label="Total pagado" value={soles(order.total)} mono bold />
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <div
            style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 6, fontWeight: 600 }}
          >
            COMPROBANTE DEL CLIENTE
          </div>
          {proofUrl ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proofUrl}
                alt="Comprobante del cliente"
                style={{
                  width: '100%',
                  height: 160,
                  borderRadius: 10,
                  objectFit: 'contain',
                  background: '#F0EBE3',
                }}
              />
              {verified && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(22,163,74,0.15)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MS name="check_circle" size={40} filled style={{ color: '#16A34A' }} />
                </div>
              )}
            </div>
          ) : (
            <div className="tv-ph" style={{ width: '100%', height: 130, borderRadius: 10 }}>
              <span>El cliente aún no ha subido el comprobante</span>
            </div>
          )}
        </div>
        {!verified && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={onReject}
              className="tv-btn tv-btn-sm"
              style={{ border: '1.5px solid #FCA5A5', background: '#FFF5F5', color: '#DC2626' }}
            >
              <MS name="cancel" size={14} /> Inválido
            </button>
            <button
              type="button"
              onClick={onVerify}
              disabled={!proofUrl}
              className="tv-btn tv-btn-sm"
              style={{ background: '#16A34A', color: '#fff', border: 'none' }}
            >
              <MS name="check_circle" size={14} /> Correcto
            </button>
          </div>
        )}
        {verified && (
          <div style={{ fontSize: 12, color: '#15803D', fontWeight: 600, textAlign: 'center' }}>
            Comprobante verificado · puedes aceptar el pedido
          </div>
        )}
      </div>
    </div>
  )
}

function PaySectionMixed({ order, qrUrl }: { order: OrderVM; qrUrl: string | null }) {
  return (
    <div
      style={{
        background: '#FFFBEB',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid #FDE68A',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="shuffle" size={18} filled style={{ color: '#B45309' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Pago combinado</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Billetera digital" value={soles(order.walletPart ?? 0)} mono />
        <Row label="Efectivo" value={soles(order.cashPart ?? 0)} mono />
        <div style={{ height: 1, background: 'var(--tv-border)', margin: '2px 0' }} />
        <Row label="Total" value={soles(order.total)} mono bold />
        {order.paysWith != null && (
          <Row label="Cliente paga efectivo con" value={soles(order.paysWith)} mono />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#D1FAE5',
              borderRadius: 8,
              padding: '6px 10px',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
              Vuelto (efectivo)
            </span>
            <span className="tv-mono" style={{ fontSize: 15, fontWeight: 700, color: '#15803D' }}>
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
      {qrUrl && (
        <div
          style={{
            marginTop: 10,
            background: '#fff',
            borderRadius: 10,
            padding: 10,
            textAlign: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR del restaurante"
            style={{
              width: 80,
              height: 80,
              borderRadius: 8,
              margin: '0 auto',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Reason modal (rechazo / cancelación) ─────────────────────────────────────
function ReasonModal({
  title,
  subtitle,
  reasons,
  confirmLabel,
  cancelLabel,
  order,
  onClose,
  onConfirm,
}: {
  title: string
  subtitle: string
  reasons: RejectReason[]
  confirmLabel: string
  cancelLabel: string
  order: OrderVM
  onClose: () => void
  onConfirm: (code: string, text: string) => void
}) {
  const [sel, setSel] = useState(0)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '20px 18px 28px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
              background: 'var(--tv-danger-soft)',
              color: 'var(--tv-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="cancel" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
              #{order.id} · {order.customer ?? 'Cliente'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="close" size={16} />
          </button>
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--tv-ink-muted)',
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {subtitle}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {reasons.map((r, i) => (
            <button
              type="button"
              key={r.code + i}
              onClick={() => setSel(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: i === sel ? 'var(--tv-ink)' : 'var(--tv-surface)',
                color: i === sel ? '#fff' : 'var(--tv-ink)',
                border: 'none',
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: `2px solid ${i === sel ? '#fff' : 'var(--tv-border)'}`,
                  background: i === sel ? '#fff' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i === sel && (
                  <div
                    style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--tv-ink)' }}
                  />
                )}
              </div>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onClose} className="tv-btn tv-btn-ghost">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              const r = reasons[sel]
              if (r) onConfirm(r.code, r.label)
            }}
            className="tv-btn"
            style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const REJECT_REASONS_BASE: RejectReason[] = [
  { code: 'out_of_stock', label: 'Producto agotado' },
  { code: 'closed', label: 'Restaurante cerrado / fuera de horario' },
  { code: 'out_of_zone', label: 'Dirección fuera de zona de cobertura' },
]
const REJECT_REASONS_TAIL: RejectReason[] = [
  { code: 'no_answer', label: 'Cliente no responde llamada' },
  { code: 'other', label: 'Otro' },
]
const CANCEL_REASONS: RejectReason[] = [
  { code: 'out_of_stock', label: 'Producto agotado' },
  { code: 'other', label: 'Cliente canceló por teléfono' },
  { code: 'out_of_zone', label: 'Dirección incorrecta o imposible' },
  { code: 'closed', label: 'Restaurante no puede continuar' },
  { code: 'other', label: 'Sin motorizado disponible después de mucho tiempo' },
  { code: 'other', label: 'Otro' },
]

// ── Detail screen ─────────────────────────────────────────────────────────────
export function DetailScreen({
  order,
  items,
  proofUrl,
  qrUrl,
  busy,
  mobile = false,
  actions,
}: {
  order: OrderVM
  items: DetailItem[] | null
  proofUrl: string | null
  qrUrl: string | null
  busy: boolean
  mobile?: boolean
  actions: DetailActions
}) {
  const [prep, setPrep] = useState(20)
  const [modal, setModal] = useState<null | 'reject' | 'cancel'>(null)

  const isPending = order.status === 'pending_acceptance' || order.status === 'validando'
  const isPrepaid = order.payment === 'prepaid'
  const isOnline = order.source === 'web'
  const acceptDisabled = busy || (isPrepaid && order.proofStatus !== 'verified')
  const showPrepPicker = isPending && !(isPrepaid && order.proofStatus !== 'verified')

  const rejectReasons = isPrepaid
    ? [
        ...REJECT_REASONS_BASE,
        { code: 'invalid_proof', label: 'Comprobante de pago inválido' },
        ...REJECT_REASONS_TAIL,
      ]
    : [...REJECT_REASONS_BASE, ...REJECT_REASONS_TAIL]

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        position: 'relative',
      }}
    >
      {modal === 'reject' && (
        <ReasonModal
          title="Rechazar pedido"
          subtitle="Motivo del rechazo"
          reasons={rejectReasons}
          confirmLabel="Confirmar rechazo"
          cancelLabel="Cancelar"
          order={order}
          onClose={() => setModal(null)}
          onConfirm={(code, text) => {
            setModal(null)
            actions.onReject(code, text)
          }}
        />
      )}
      {modal === 'cancel' && (
        <ReasonModal
          title="Cancelar pedido"
          subtitle="Motivo"
          reasons={CANCEL_REASONS}
          confirmLabel="Confirmar cancelación"
          cancelLabel="Cancelar acción"
          order={order}
          onClose={() => setModal(null)}
          onConfirm={(code, text) => {
            setModal(null)
            actions.onCancel(code, text)
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          padding: mobile ? '10px 14px' : '12px 18px',
          borderBottom: '1px solid var(--tv-border)',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MS name="arrow_back" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexWrap: 'wrap',
              marginBottom: 3,
            }}
          >
            <span
              className="tv-mono"
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink-muted)' }}
            >
              #{order.id}
            </span>
            {isPending && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>
                  · acepta antes de
                </span>
                <span
                  className="tv-mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: order.countdownSec < 60 ? 'var(--tv-danger)' : 'var(--tv-ink)',
                  }}
                >
                  {mmss(order.countdownSec)}
                </span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SourceBadgeMini source={order.source} />
            <PayBadgeMini payment={order.payment} />
          </div>
        </div>
        <span
          className="tv-mono"
          style={{
            fontSize: mobile ? 18 : 20,
            fontWeight: 700,
            color: 'var(--tv-ink)',
            flexShrink: 0,
          }}
        >
          {soles(order.total)}
        </span>
        {!mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="close" size={18} />
          </button>
        )}
      </div>

      {/* Driver arrived banner */}
      {order.state === 'waiting' && (
        <div
          style={{
            background: '#16A34A',
            color: '#fff',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MS name="check_circle" size={20} filled />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {order.driver?.name ?? 'El motorizado'} llegó al local · Entregar pedido
            </div>
            {order.cashChange != null && order.cashChange > 0 && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                Prepara el vuelto:{' '}
                <span className="tv-mono" style={{ fontWeight: 700 }}>
                  {soles(order.cashChange)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: mobile ? '14px 14px 20px' : '16px 18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Cliente */}
        <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tv-ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 7,
            }}
          >
            Cliente
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>
            {order.customer ?? 'Cliente'}
          </div>
          {order.phone && (
            <a
              href={`tel:${order.phone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: 'var(--tv-brand)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              <MS name="call" size={15} filled /> {order.phone}
            </a>
          )}
        </div>

        {/* Dirección */}
        {order.addressRef && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--tv-ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 7,
              }}
            >
              Dirección
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MS
                name="location_on"
                size={16}
                style={{ color: 'var(--tv-brand)', flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{order.addressRef}</div>
            </div>
          </div>
        )}

        {/* Items (Online) o Cobro (Directo) */}
        {isOnline && items && items.length > 0 ? (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--tv-ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 7,
              }}
            >
              Pedido
            </div>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  padding: '7px 0',
                  borderBottom: i < items.length - 1 ? '1px solid var(--tv-border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <span
                    className="tv-mono"
                    style={{
                      color: 'var(--tv-ink-muted)',
                      width: 22,
                      flexShrink: 0,
                      fontWeight: 700,
                    }}
                  >
                    {it.qty}×
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                    {it.mods && (
                      <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>{it.mods}</div>
                    )}
                    {it.note && (
                      <div style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                        <MS name="info" size={11} /> {it.note}
                      </div>
                    )}
                  </div>
                  <span
                    className="tv-mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                      color: 'var(--tv-ink-muted)',
                    }}
                  >
                    {soles(it.price)}
                  </span>
                </div>
              </div>
            ))}
            <div
              style={{
                marginTop: 10,
                padding: '8px 0 0',
                borderTop: '1px solid var(--tv-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <Row label="Subtotal" value={soles(order.subtotal)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee)} mono />
              <Row label="Total" value={soles(order.total)} mono bold />
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--tv-ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
              }}
            >
              Cobro
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Row label="Total del pedido" value={soles(order.amount)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee)} mono />
              <div style={{ height: 1, background: 'var(--tv-border)', margin: '2px 0' }} />
              <Row label="Total a cobrar" value={soles(order.total)} mono bold />
            </div>
          </div>
        )}

        {/* Sección de pago */}
        {order.payment === 'pending_cash' && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet order={order} qrUrl={qrUrl} />}
        {order.payment === 'prepaid' && (
          <PaySectionPrepaid
            order={order}
            proofUrl={proofUrl}
            onVerify={() => actions.onVerifyProof()}
            onReject={() => actions.onRejectProof()}
          />
        )}
        {order.payment === 'pending_mixed' && <PaySectionMixed order={order} qrUrl={qrUrl} />}

        {/* Prep picker (al aceptar) */}
        {showPrepPicker && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div className="tv-label" style={{ marginBottom: 8 }}>
              TIEMPO DE PREPARACIÓN
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                paddingBottom: 4,
              }}
            >
              {PREP_PRESETS.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPrep(m)}
                  style={{
                    flexShrink: 0,
                    minWidth: 50,
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
        )}

        {/* Extensión de preparación */}
        {order.state === 'cooking' && !order.extensionUsed && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              ¿Necesitas más tiempo?
            </div>
            <button
              type="button"
              onClick={() => actions.onExtend()}
              disabled={busy}
              className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block"
            >
              <MS name="add" size={14} /> +10 min
            </button>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 6 }}>
              Solo disponible una vez y antes de que llegue el motorizado.
            </div>
          </div>
        )}
        {order.state === 'cooking' && order.extensionUsed && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--tv-warning)',
              fontWeight: 600,
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            Prórroga +{order.extensionMin}m usada · no se puede volver a extender
          </div>
        )}

        {/* Buffer p3: llamar motorizado */}
        {order.state === 'buffer_p3' && actions.onCallDriver && (
          <button
            type="button"
            onClick={actions.onCallDriver}
            className="tv-btn tv-btn-sm tv-btn-block"
            style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none' }}
          >
            <MS name="call" size={15} /> Llamar a un motorizado manualmente
          </button>
        )}

        {/* Otras acciones */}
        {!isPending && order.state !== 'picked_up' && (
          <div
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              border: '1px solid var(--tv-border)',
              background: 'var(--tv-surface)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--tv-ink-muted)',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Otras acciones
            </div>
            <button
              type="button"
              onClick={() => setModal('cancel')}
              disabled={busy}
              className="tv-btn tv-btn-sm tv-btn-block"
              style={{
                background: 'transparent',
                border: '1.5px solid var(--tv-danger)',
                color: 'var(--tv-danger)',
              }}
            >
              <MS name="cancel" size={14} /> Cancelar este pedido
            </button>
          </div>
        )}
      </div>

      {/* Footer de acciones (pendiente) */}
      {isPending && (
        <div
          style={{
            background: '#fff',
            borderTop: '1px solid var(--tv-border)',
            padding: '12px 14px 14px',
            boxShadow: '0 -6px 20px rgba(0,0,0,0.06)',
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setModal('reject')}
            disabled={busy}
            className="tv-btn tv-btn-ghost"
            style={{ flex: 1, color: 'var(--tv-danger)' }}
          >
            <MS name="close" size={18} /> Rechazar
          </button>
          <button
            type="button"
            onClick={() => actions.onAccept(prep)}
            disabled={acceptDisabled}
            className="tv-btn tv-btn-brand"
            style={{ flex: 2 }}
          >
            <MS name="check" size={18} filled />
            {isPrepaid && order.proofStatus !== 'verified'
              ? 'Verifica el comprobante'
              : `Aceptar · ${prep}m`}
          </button>
        </div>
      )}

      {/* Footer cocina: marcar listo para el motorizado */}
      {order.status === 'preparing' && (
        <div
          style={{
            background: '#fff',
            borderTop: '1px solid var(--tv-border)',
            padding: '12px 14px 14px',
            boxShadow: '0 -6px 20px rgba(0,0,0,0.06)',
          }}
        >
          <button
            type="button"
            onClick={() => actions.onReady()}
            disabled={busy}
            className="tv-btn tv-btn-block"
            style={{ background: 'var(--tv-success)', color: '#fff' }}
          >
            <MS name="inventory_2" size={18} filled /> Listo — llamar moto
          </button>
        </div>
      )}
    </div>
  )

  if (mobile) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#fff' }}>
        {content}
      </div>
    )
  }
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 90,
        width: 380,
        background: '#fff',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.1)',
      }}
    >
      {content}
    </div>
  )
}

// ── Modal: Pausar pedidos (busy mode) ────────────────────────────────────────
const PAUSE_OPTS: { label: string; sub: string; min: number | null; default?: boolean }[] = [
  { label: '15 minutos', sub: 'Para un pico rápido', min: 15 },
  { label: '30 minutos', sub: 'La opción más común', min: 30, default: true },
  { label: '1 hora', sub: 'Para horas de alta demanda', min: 60 },
  { label: '2 horas', sub: 'Para el resto del turno', min: 120 },
  { label: 'Hasta que reactive', sub: 'Sin tiempo fijo', min: null },
]

export function PausarModal({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean
  onClose: () => void
  onConfirm: (minutes: number | null) => void
}) {
  const [sel, setSel] = useState(1)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: 20,
          maxWidth: 340,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              background: '#FEF3C7',
              color: '#92400E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="pause_circle" size={22} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Pausar pedidos</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
              ¿Por cuánto tiempo?
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'rgba(26,22,20,0.06)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="close" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {PAUSE_OPTS.map((o, i) => (
            <button
              type="button"
              key={o.label}
              onClick={() => setSel(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 9,
                background: i === sel ? 'var(--tv-ink)' : 'var(--tv-surface)',
                color: i === sel ? '#fff' : 'var(--tv-ink)',
                border: 'none',
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>{o.sub}</div>
              </div>
              {i === sel && <MS name="check" size={16} />}
            </button>
          ))}
        </div>

        <div
          style={{
            background: '#FEF3C7',
            borderRadius: 9,
            padding: '9px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: '#92400E',
          }}
        >
          <strong>Los pedidos activos continúan</strong> su flujo. Solo se bloquean los nuevos desde
          la web.
        </div>
        <button
          type="button"
          onClick={() => onConfirm(PAUSE_OPTS[sel]?.min ?? null)}
          disabled={busy}
          className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg"
        >
          {PAUSE_OPTS[sel]?.min
            ? `Confirmar pausa de ${PAUSE_OPTS[sel]?.label.toLowerCase()}`
            : 'Confirmar pausa'}
        </button>
      </div>
    </div>
  )
}
