'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
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
        flexShrink: 0,
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
        flexShrink: 0,
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
  busy,
  onVerify,
  onReject,
}: {
  order: OrderVM
  proofUrl: string | null
  busy: boolean
  onVerify: () => void
  onReject: () => void
}) {
  const [zoom, setZoom] = useState(false)
  const isSecondAttempt = (order.proofAttempt ?? 0) >= 2
  const verified =
    order.proofStatus === 'verified' ||
    order.status === 'confirmed' ||
    order.status === 'preparing' ||
    order.status === 'waiting_driver' ||
    order.status === 'picked_up' ||
    order.status === 'delivered'

  return (
    <>
      {zoom && proofUrl && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <MS name="close" size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofUrl}
            alt="Comprobante ampliado"
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          />
          <div style={{ color: '#fff', fontSize: 13, marginTop: 12, fontWeight: 600 }}>
            Comprobante de pago — {order.customer ?? 'Cliente'} ({soles(order.total)})
          </div>
        </div>
      )}

      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: verified
            ? '1.5px solid #4ADE80'
            : isSecondAttempt
              ? '1.5px solid #FCA5A5'
              : '1.5px solid #38BDF8',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            background: verified ? '#F0FDF4' : isSecondAttempt ? '#FEF2F2' : '#F0F9FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MS
              name={verified ? 'verified' : 'schedule'}
              size={18}
              filled
              style={{ color: verified ? '#16A34A' : isSecondAttempt ? '#DC2626' : '#0284C7' }}
            />
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: verified ? '#166534' : isSecondAttempt ? '#991B1B' : '#0369A1',
              }}
            >
              {verified ? 'Pago verificado' : 'Verificar comprobante de pago'}
            </div>
          </div>
          {isSecondAttempt && !verified && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: '#FEE2E2',
                color: '#991B1B',
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid #FCA5A5',
              }}
            >
              Segundo y último intento
            </span>
          )}
        </div>

        <div style={{ padding: '12px 14px', background: '#fff' }}>
          {/* Guía de validación */}
          {!verified && (
            <div
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                background: '#F8FAFC',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                fontSize: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--tv-ink-muted)',
                  marginBottom: 6,
                  letterSpacing: '0.05em',
                }}
              >
                DATOS DE VALIDACIÓN
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Monto</span>
                  <span className="tv-mono" style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
                    {soles(order.total)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Hora pedido</span>
                  <span className="tv-mono" style={{ fontWeight: 700, fontSize: 13 }}>
                    {order.createdAtFormatted ?? '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Cliente</span>
                  <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.customer ?? 'Cliente'}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: '#475569',
                  borderTop: '1px dashed #CBD5E1',
                  paddingTop: 5,
                  lineHeight: 1.3,
                }}
              >
                Verifica pago posterior a <strong>{order.createdAtFormatted ?? 'la hora del pedido'}</strong> por <strong>{soles(order.total)}</strong>.
              </div>
            </div>
          )}

          <Row label="Total pagado" value={soles(order.total)} mono bold />
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--tv-ink-muted)',
                marginBottom: 6,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              COMPROBANTE DEL CLIENTE
            </div>
            {proofUrl ? (
              <div
                onClick={() => setZoom(true)}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid #CBD5E1',
                  background: '#F1F5F9',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Comprobante del cliente"
                  style={{
                    width: '100%',
                    maxHeight: 320,
                    objectFit: 'contain',
                    background: '#F8FAFC',
                    display: 'block',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    background: 'rgba(15, 23, 42, 0.95)',
                    color: '#fff',
                    fontSize: 11,
                    padding: '6px 12px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontWeight: 600,
                    backdropFilter: 'blur(2px)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}
                >
                  <MS name="zoom_in" size={15} /> Ampliar comprobante
                </div>
                {verified && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(22,163,74,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MS name="check_circle" size={44} filled style={{ color: '#16A34A' }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="tv-ph" style={{ width: '100%', height: 130, borderRadius: 10 }}>
                <span>El cliente aún no ha subido el comprobante</span>
              </div>
            )}
          </div>
          {verified && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#15803D', fontWeight: 600, textAlign: 'center' }}>
              Comprobante verificado · pago registrado
            </div>
          )}
        </div>
      </div>
    </>
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
        flexShrink: 0,
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

function PrepTimeModal({
  order,
  onClose,
  onConfirm,
}: {
  order: OrderVM
  onClose: () => void
  onConfirm: (prep: number) => void
}) {
  const [sel, setSel] = useState(20)
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
              background: 'var(--tv-brand-soft, #EEF2FF)',
              color: 'var(--tv-brand, #4F46E5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MS name="schedule" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Tiempo de preparación</div>
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
          Selecciona el tiempo estimado para cocinar
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {PREP_PRESETS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSel(m)}
              style={{
                border: m === sel ? 'none' : '1px solid var(--tv-border)',
                background: m === sel ? 'var(--tv-ink)' : '#fff',
                color: m === sel ? '#fff' : 'var(--tv-ink)',
                fontFamily: "var(--font-jetbrains), 'Manrope', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                padding: '12px 0',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {m} min
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <button type="button" onClick={onClose} className="tv-btn tv-btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(sel)}
            className="tv-btn tv-btn-brand"
            style={{ background: '#16A34A', color: '#fff', border: 'none' }}
          >
            Confirmar y empezar
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
  const [itemsOpen, setItemsOpen] = useState(order.status !== 'validando')
  const [showPrepModal, setShowPrepModal] = useState(false)
  const [hasAppeal, setHasAppeal] = useState(false)

  useEffect(() => {
    const origOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = origOverflow
    }
  }, [])

  useEffect(() => {
    if (order.status === 'cancelled') {
      const supabase = getSupabaseBrowser()
      supabase
        .from('reports')
        .select('id')
        .eq('order_id', order.rowId)
        .eq('type', 'rejected_proof_disputed')
        .maybeSingle()
        .then(({ data }) => setHasAppeal(Boolean(data)))
    } else {
      setHasAppeal(false)
    }
  }, [order.rowId, order.status])

  const isPending = order.status === 'pending_acceptance' || order.status === 'awaiting_payment' || order.status === 'validando'
  const isPrepaid = order.payment === 'prepaid'
  const isOnline = order.source === 'web'
  const acceptDisabled = busy
  const isValidandoPrepaid = isPrepaid && order.status === 'validando'
  const showPrepPicker = isPending && !isPrepaid

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
        maxHeight: '100%',
        minHeight: 0,
        background: '#fff',
        position: 'relative',
        overflow: 'hidden',
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
      {showPrepModal && (
        <PrepTimeModal
          order={order}
          onClose={() => setShowPrepModal(false)}
          onConfirm={(prepTime) => {
            setShowPrepModal(false)
            actions.onAccept(prepTime)
          }}
        />
      )}

      {/* Header flotante/fijo */}
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
          flexShrink: 0,
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
            flexShrink: 0,
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
        className="tv-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: mobile ? '14px 14px 28px' : '16px 18px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Banner de apelación: solo para proof_rejected_final */}
        {hasAppeal && order.status === 'cancelled' && order.cancelReasonCode === 'proof_rejected_final' && (
          <div
            style={{
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <MS name="gavel" size={18} filled style={{ color: '#D97706' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                El cliente apeló el rechazo de este pedido
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.4 }}>
              Tindivo está revisando este caso. Te recomendamos verificar tu cuenta Yape/Plin por si el pago sí ingresó.
            </div>
          </div>
        )}

        {/* Sección de pago (al inicio si está validando prepago) */}
        {isValidandoPrepaid && (
          <PaySectionPrepaid
            order={order}
            proofUrl={proofUrl}
            busy={busy}
            onVerify={() => actions.onVerifyProof()}
            onReject={() => actions.onRejectProof()}
          />
        )}

        {/* Cliente y Dirección */}
        {isValidandoPrepaid ? (
          <div
            style={{
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--tv-ink-muted)',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px 8px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MS name="person" size={14} style={{ color: 'var(--tv-ink-muted)' }} />
              <span style={{ fontWeight: 700, color: 'var(--tv-ink)' }}>
                {order.customer ?? 'Cliente'}
              </span>
            </div>
            {order.phone && (
              <>
                <span>·</span>
                <a
                  href={`tel:${order.phone}`}
                  style={{
                    color: 'var(--tv-brand)',
                    textDecoration: 'none',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <MS name="call" size={12} filled /> {order.phone}
                </a>
              </>
            )}
            {order.addressRef && (
              <>
                <span>·</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    minWidth: 0,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  title={order.addressRef}
                >
                  <MS name="location_on" size={12} style={{ color: 'var(--tv-brand)' }} />
                  {order.addressRef}
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Cliente */}
            <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px', flexShrink: 0 }}>
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
              <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px', flexShrink: 0 }}>
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
          </>
        )}

        {/* Items (Online) o Cobro (Directo) */}
        {isOnline && items && items.length > 0 ? (
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            style={{
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: isValidandoPrepaid ? '10px 12px' : '12px 14px',
              flexShrink: 0,
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                userSelect: 'none',
                listStyle: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MS name="shopping_bag" size={16} />
                <span>
                  Pedido ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="tv-mono">{soles(order.total)}</span>
                <MS
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  style={{ color: 'var(--tv-ink-muted)' }}
                />
              </div>
            </summary>
            <div style={{ marginTop: 8, borderTop: '1px solid var(--tv-border)', paddingTop: 8 }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    padding: '5px 0',
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
          </details>
        ) : (
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            style={{
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: isValidandoPrepaid ? '10px 12px' : '12px 14px',
              flexShrink: 0,
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                userSelect: 'none',
                listStyle: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MS name="payments" size={16} />
                <span>Cobro</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="tv-mono">{soles(order.total)}</span>
                <MS
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  style={{ color: 'var(--tv-ink-muted)' }}
                />
              </div>
            </summary>
            <div
              style={{
                marginTop: 8,
                borderTop: '1px solid var(--tv-border)',
                paddingTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <Row label="Total del pedido" value={soles(order.amount)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee)} mono />
              <div style={{ height: 1, background: 'var(--tv-border)', margin: '2px 0' }} />
              <Row label="Total a cobrar" value={soles(order.total)} mono bold />
            </div>
          </details>
        )}

        {/* Sección de pago */}
        {order.payment === 'pending_cash' && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet order={order} qrUrl={qrUrl} />}
        {order.payment === 'prepaid' && !isValidandoPrepaid && (
          <>
            {/* 1. pending_acceptance: Nada de comprobante */}
            {/* 2. awaiting_payment: Banner de espera sin botones */}
            {order.status === 'awaiting_payment' && (
              <div
                style={{
                  background: '#FFF7ED',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid #FFEDD5',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <MS name="schedule" size={18} filled style={{ color: '#C2410C' }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>
                    Esperando pago del cliente
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#C2410C', lineHeight: 1.4 }}>
                  Disponibilidad confirmada. El cliente tiene 10 minutos para realizar la transferencia por Yape/Plin y adjuntar el comprobante.
                </div>
              </div>
            )}
            {/* 3. validando: Guía de validación + comprobante + botones */}
            {order.status === 'validando' && (
              <PaySectionPrepaid
                order={order}
                proofUrl={proofUrl}
                busy={busy}
                onVerify={() => actions.onVerifyProof()}
                onReject={() => actions.onRejectProof()}
              />
            )}
            {/* 4. confirmed / otros con comprobante verificado */}
            {order.status !== 'pending_acceptance' &&
              order.status !== 'awaiting_payment' &&
              order.status !== 'validando' &&
              proofUrl && (
                <PaySectionPrepaid
                  order={order}
                  proofUrl={proofUrl}
                  busy={busy}
                  onVerify={() => actions.onVerifyProof()}
                  onReject={() => actions.onRejectProof()}
                />
              )}
          </>
        )}
        {order.payment === 'pending_mixed' && <PaySectionMixed order={order} qrUrl={qrUrl} />}

        {/* Prep picker (al aceptar) */}
        {showPrepPicker && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px', flexShrink: 0 }}>
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
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px', flexShrink: 0 }}>
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
              flexShrink: 0,
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
            style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none', flexShrink: 0 }}
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
              flexShrink: 0,
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
            flexDirection: 'column',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {order.status === 'validando' && isPrepaid ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => actions.onRejectProof()}
                disabled={!proofUrl || busy}
                className="tv-btn tv-btn-ghost"
                style={{ flex: 1, color: 'var(--tv-danger)', border: '1.5px solid #FCA5A5', background: '#FFF5F5', opacity: (!proofUrl || busy) ? 0.5 : 1 }}
              >
                <MS name="cancel" size={18} /> Inválido
              </button>
              <button
                type="button"
                onClick={() => setShowPrepModal(true)}
                disabled={!proofUrl || busy}
                className="tv-btn tv-btn-brand"
                style={{ flex: 2, background: '#16A34A', opacity: (!proofUrl || busy) ? 0.5 : 1 }}
              >
                <MS name="check_circle" size={18} filled /> Confirmar pago
              </button>
            </div>
          ) : order.status === 'awaiting_payment' && isPrepaid ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModal('cancel')}
                disabled={busy}
                className="tv-btn tv-btn-ghost"
                style={{ flex: 1, color: 'var(--tv-danger)' }}
              >
                <MS name="close" size={18} /> Cancelar
              </button>
              <div
                className="tv-btn"
                style={{ flex: 2, background: '#F3F4F6', color: '#9CA3AF', cursor: 'not-allowed', justifyContent: 'center', pointerEvents: 'none' }}
              >
                Esperando pago...
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
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
                  onClick={() => actions.onAccept(order.status === 'pending_acceptance' && isPrepaid ? 20 : prep)}
                  disabled={acceptDisabled}
                  className="tv-btn tv-btn-brand"
                  style={{ flex: 2 }}
                >
                  <MS name="check" size={18} filled />
                  {order.status === 'pending_acceptance' && isPrepaid
                    ? 'Aceptar disponibilidad'
                    : `Aceptar · ${prep}m`}
                </button>
              </div>
              {order.status === 'pending_acceptance' && isPrepaid && (
                <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', textAlign: 'center' }}>
                  Confirmas disponibilidad para preparar. El cliente procederá a realizar el pago por Yape/Plin.
                </div>
              )}
            </>
          )}
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
            flexShrink: 0,
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#fff' }}>
        {content}
      </div>
    )
  }

  return (
    <div
      onClick={actions.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '100vw',
          height: '100vh',
          maxHeight: '100vh',
          background: '#fff',
          boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {content}
      </div>
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
