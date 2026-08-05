'use client'

import { cn, Icon } from '@tindivo/ui'

import { useEffect, useState } from 'react'
import { formatReadyDelta, type OrderVM } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { mmss, PayBadgeMini, SourceBadgeMini, soles } from './primitives'

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
  /** Escala a Tindivo por WhatsApp. Recibe el pedido: también lo llama la
   *  tarjeta del tablero, donde no hay ningún detalle abierto. */
  onCallDriver?: (o: OrderVM) => void
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
      <span className="text-ink-muted">{label}</span>
      <span className={mono ? 'font-mono' : ''} style={{ fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )
}

// ── Payment sections ──────────────────────────────────────────────────────────
function PaySectionCash({ order }: { order: OrderVM }) {
  return (
    <div
      className="bg-green-50 border border-green-200"
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Icon weight={500} name="payments" size={18} filled className="text-green-600" />
        <div className="text-green-800" style={{ fontSize: 13, fontWeight: 700 }}>
          Pago en efectivo
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Total a cobrar" value={soles(order.total)} mono bold />
        {order.paysWith != null && (
          <Row label="Cliente paga con" value={soles(order.paysWith)} mono />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div
            className="bg-green-100"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: 8,
              padding: '6px 10px',
              marginTop: 4,
            }}
          >
            <span className="text-green-800" style={{ fontSize: 12, fontWeight: 700 }}>
              Vuelto a preparar
            </span>
            <span className="font-mono text-green-700" style={{ fontSize: 16, fontWeight: 700 }}>
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
      className="bg-violet-50 border border-violet-200"
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Icon weight={500} name="qr_code_2" size={18} filled className="text-violet-600" />
        <div className="text-violet-800" style={{ fontSize: 13, fontWeight: 700 }}>
          Cobrar con billetera digital
        </div>
      </div>
      <Row label="Total a cobrar" value={soles(order.total)} mono bold />
      <div
        className="bg-white"
        style={{
          marginTop: 10,
          borderRadius: 10,
          padding: 10,
          textAlign: 'center',
        }}
      >
        <div
          className="text-ink-muted"
          style={{
            fontSize: 10,
            fontWeight: 700,
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
            className="relative overflow-hidden rounded-[10px] bg-surface-low"
            style={{ width: 90, height: 90, margin: '0 auto 8px' }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wide text-ink/50">
              QR Yape/Plin
            </span>
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
          className="bg-black/85"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
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
            className="bg-white border-transparent shadow-elev-3"
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofUrl}
            alt="Comprobante ampliado"
            className="shadow-elev-4"
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
            }}
          />
          <div className="text-white" style={{ fontSize: 13, marginTop: 12, fontWeight: 600 }}>
            Comprobante de pago — {order.customer ?? 'Cliente'} ({soles(order.total)})
          </div>
        </div>
      )}

      <div
        className={cn(
          'border-[1.5px] shadow-elev-2',
          verified && 'border-green-400',
          !verified && isSecondAttempt && 'border-red-300',
          !verified && !isSecondAttempt && 'border-sky-400',
        )}
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          className={cn(verified ? 'bg-green-50' : isSecondAttempt ? 'bg-red-50' : 'bg-sky-50')}
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon
              weight={500}
              name={verified ? 'verified' : 'schedule'}
              size={18}
              filled
              className={
                verified ? 'text-green-600' : isSecondAttempt ? 'text-danger' : 'text-sky-600'
              }
            />
            <div
              className={cn(
                'text-[13px] font-bold',
                verified ? 'text-green-800' : isSecondAttempt ? 'text-red-800' : 'text-sky-700',
              )}
            >
              {verified ? 'Pago verificado' : 'Verificar comprobante de pago'}
            </div>
          </div>
          {isSecondAttempt && !verified && (
            <span
              className="bg-danger-soft text-red-800 border border-red-300"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              Segundo y último intento
            </span>
          )}
        </div>

        <div className="bg-white" style={{ padding: '12px 14px' }}>
          {/* Guía de validación */}
          {!verified && (
            <div
              className="bg-slate-50 border border-slate-200"
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              <div
                className="text-ink-muted"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  marginBottom: 6,
                  letterSpacing: '0.05em',
                }}
              >
                DATOS DE VALIDACIÓN
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1.2fr',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="text-ink-muted" style={{ fontSize: 10, marginBottom: 2 }}>
                    Monto
                  </span>
                  <span
                    className="font-mono text-success"
                    style={{ fontWeight: 700, fontSize: 13 }}
                  >
                    {soles(order.total)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="text-ink-muted" style={{ fontSize: 10, marginBottom: 2 }}>
                    Hora pedido
                  </span>
                  <span className="font-mono" style={{ fontWeight: 700, fontSize: 13 }}>
                    {order.createdAtFormatted ?? '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="text-ink-muted" style={{ fontSize: 10, marginBottom: 2 }}>
                    Cliente
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {order.customer ?? 'Cliente'}
                  </span>
                </div>
              </div>
              <div
                className="text-slate-600 border-t border-dashed border-slate-300"
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  paddingTop: 5,
                  lineHeight: 1.3,
                }}
              >
                Verifica pago posterior a{' '}
                <strong>{order.createdAtFormatted ?? 'la hora del pedido'}</strong> por{' '}
                <strong>{soles(order.total)}</strong>.
              </div>
            </div>
          )}

          <Row label="Total pagado" value={soles(order.total)} mono bold />
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div
              className="text-ink-muted"
              style={{
                fontSize: 10,
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
                className="border border-slate-300 bg-slate-100"
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Comprobante del cliente"
                  className="bg-slate-50"
                  style={{
                    width: '100%',
                    maxHeight: 320,
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
                <div
                  className="bg-ink/95 text-white shadow-elev-2"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    fontSize: 11,
                    padding: '6px 12px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontWeight: 600,
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  <Icon weight={500} name="zoom_in" size={15} /> Ampliar comprobante
                </div>
                {verified && (
                  <div
                    className="bg-success/15"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      weight={500}
                      name="check_circle"
                      size={44}
                      filled
                      className="text-green-600"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div
                className="relative overflow-hidden rounded-[10px] bg-surface-low"
                style={{ width: '100%', height: 130 }}
              >
                <span className="absolute inset-0 flex items-center justify-center px-1.5 text-center text-[10px] uppercase tracking-wide text-ink/50">
                  El cliente aún no ha subido el comprobante
                </span>
              </div>
            )}
          </div>
          {verified && (
            <div
              className="text-green-700"
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
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
      className="bg-amber-50 border border-amber-200"
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Icon weight={500} name="shuffle" size={18} filled className="text-amber-700" />
        <div className="text-amber-800" style={{ fontSize: 13, fontWeight: 700 }}>
          Pago combinado
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Billetera digital" value={soles(order.walletPart ?? 0)} mono />
        <Row label="Efectivo" value={soles(order.cashPart ?? 0)} mono />
        <div className="h-px bg-border" style={{ margin: '2px 0' }} />
        <Row label="Total" value={soles(order.total)} mono bold />
        {order.paysWith != null && (
          <Row label="Cliente paga efectivo con" value={soles(order.paysWith)} mono />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div
            className="bg-green-100"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: 8,
              padding: '6px 10px',
              marginTop: 4,
            }}
          >
            <span className="text-green-800" style={{ fontSize: 12, fontWeight: 700 }}>
              Vuelto (efectivo)
            </span>
            <span className="font-mono text-green-700" style={{ fontSize: 15, fontWeight: 700 }}>
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
      {qrUrl && (
        <div
          className="bg-white"
          style={{
            marginTop: 10,
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
      className="bg-black/50"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="bg-white shadow-elev-3"
        style={{
          borderRadius: '20px 20px 0 0',
          padding: '20px 18px 28px',
          width: '100%',
          maxWidth: 440,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            className="bg-danger-soft text-danger"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="cancel" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            <div className="text-ink-muted" style={{ fontSize: 12, marginTop: 1 }}>
              #{order.id} · {order.customer ?? 'Cliente'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div
          className="text-ink-muted"
          style={{
            fontSize: 12,
            fontWeight: 700,
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
              className={cn(
                'border-transparent',
                i === sel ? 'bg-ink text-white' : 'bg-surface text-ink',
              )}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <div
                className={cn(
                  'border-2',
                  i === sel ? 'border-white bg-white' : 'border-border bg-transparent',
                )}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i === sel && (
                  <div className="bg-ink" style={{ width: 7, height: 7, borderRadius: 999 }} />
                )}
              </div>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              const r = reasons[sel]
              if (r) onConfirm(r.code, r.label)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
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
      className="bg-black/50"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="bg-white shadow-elev-3"
        style={{
          borderRadius: '20px 20px 0 0',
          padding: '20px 18px 28px',
          width: '100%',
          maxWidth: 440,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            className="bg-brand-soft text-brand"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="schedule" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Tiempo de preparación</div>
            <div className="text-ink-muted" style={{ fontSize: 12, marginTop: 1 }}>
              #{order.id} · {order.customer ?? 'Cliente'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div
          className="text-ink-muted"
          style={{
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Selecciona el tiempo estimado para cocinar
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {PREP_PRESETS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSel(m)}
              className={cn(
                m === sel
                  ? 'bg-ink text-white border-transparent'
                  : 'bg-white text-ink border border-border',
              )}
              style={{
                fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(sel)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
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
  isLoadingActions = false,
  mobile = false,
  actions,
}: {
  order: OrderVM
  items: DetailItem[] | null
  proofUrl: string | null
  qrUrl: string | null
  busy: boolean
  isLoadingActions?: boolean
  mobile?: boolean
  actions: DetailActions
}) {
  const [prep, setPrep] = useState(20)
  const [modal, setModal] = useState<null | 'reject' | 'cancel'>(null)
  const [itemsOpen, setItemsOpen] = useState(order.status !== 'validando')
  const [showPrepModal, setShowPrepModal] = useState(false)
  const [hasAppeal, setHasAppeal] = useState(false)
  // Confirmación en dos pasos antes de declarar la comida lista, como en prod:
  // avisar al motorizado de que entre a recoger y que no esté lista se paga en
  // minutos de moto parada.
  const [confirmReady, setConfirmReady] = useState(false)

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

  const isPending =
    !isLoadingActions &&
    (order.status === 'pending_acceptance' ||
      order.status === 'awaiting_payment' ||
      order.status === 'validando')
  const isPrepaid = order.payment === 'prepaid'
  const isOnline = order.source === 'web'
  const acceptDisabled = busy || isLoadingActions
  const isPrepaidAwaitingProof =
    isPrepaid &&
    !proofUrl &&
    !isLoadingActions &&
    (order.status === 'pending_acceptance' || order.status === 'validando')
  const isValidandoPrepaid = isPrepaid && Boolean(proofUrl) && !isLoadingActions
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
      className="bg-white"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
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
        className="bg-white border-b border-border"
        style={{
          padding: mobile ? '10px 14px' : '12px 18px',
          position: 'sticky',
          top: 0,
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
            className="bg-ink/[0.06]"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon weight={500} name="arrow_back" size={20} />
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
            <span className="font-mono text-ink-muted" style={{ fontSize: 12, fontWeight: 700 }}>
              #{order.id}
            </span>
            {isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="text-ink-muted" style={{ fontSize: 11 }}>
                  ·{' '}
                  {order.status === 'awaiting_payment'
                    ? 'paga antes de'
                    : order.status === 'validando'
                      ? 'revisa antes de'
                      : 'acepta antes de'}
                </span>
                <span
                  className={cn('font-mono', order.countdownSec < 60 ? 'text-danger' : 'text-ink')}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {mmss(order.countdownSec)}
                </span>
              </span>
            ) : order.readySec != null && order.readySec < 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger-soft px-2 py-0.5 rounded-full border border-danger/20">
                <Icon name="priority_high" size={12} weight={500} filled className="text-danger" />
                ¡Demorado! <span className="font-mono">{formatReadyDelta(order.readySec)}</span>
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SourceBadgeMini source={order.source} />
            <PayBadgeMini payment={order.payment} />
          </div>
        </div>
        <span
          className="font-mono text-ink"
          style={{
            fontSize: mobile ? 18 : 20,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {soles(order.total)}
        </span>
        {!mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={18} />
          </button>
        )}
      </div>

      {/* Driver arrived banner */}
      {order.state === 'waiting' && (
        <div
          className="bg-success text-white"
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Icon weight={500} name="check_circle" size={20} filled />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {order.driver?.name ?? 'El motorizado'} llegó al local · Entregar pedido
            </div>
            {order.cashChange != null && order.cashChange > 0 && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                Prepara el vuelto:{' '}
                <span className="font-mono" style={{ fontWeight: 700 }}>
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
        {hasAppeal &&
          order.status === 'cancelled' &&
          order.cancelReasonCode === 'proof_rejected_final' && (
            <div
              className="bg-warning-soft border border-amber-300"
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Icon weight={500} name="gavel" size={18} filled className="text-amber-600" />
                <div className="text-amber-800" style={{ fontSize: 13, fontWeight: 700 }}>
                  El cliente apeló el rechazo de este pedido
                </div>
              </div>
              <div className="text-amber-700" style={{ fontSize: 12, lineHeight: 1.4 }}>
                Tindivo está revisando este caso. Te recomendamos verificar tu cuenta Yape/Plin por
                si el pago sí ingresó.
              </div>
            </div>
          )}

        {/* Cliente y Dirección */}
        {isValidandoPrepaid ? (
          <div
            className="bg-surface text-ink-muted"
            style={{
              borderRadius: 12,
              padding: '8px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px 8px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon weight={500} name="person" size={14} className="text-ink-muted" />
              <span className="text-ink" style={{ fontWeight: 700 }}>
                {order.customer ?? 'Cliente'}
              </span>
            </div>
            {order.phone && (
              <>
                <span>·</span>
                <a
                  href={`tel:${order.phone}`}
                  className="text-brand no-underline"
                  style={{
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Icon weight={500} name="call" size={12} filled /> {order.phone}
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
                  <Icon weight={500} name="location_on" size={12} className="text-brand" />
                  {order.addressRef}
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Cliente */}
            <div
              className="bg-surface"
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                flexShrink: 0,
              }}
            >
              <div
                className="text-ink-muted"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
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
                  className="text-brand no-underline"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Icon weight={500} name="call" size={15} filled /> {order.phone}
                </a>
              )}
            </div>

            {/* Dirección */}
            {order.addressRef && (
              <div
                className="bg-surface"
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  flexShrink: 0,
                }}
              >
                <div
                  className="text-ink-muted"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 7,
                  }}
                >
                  Dirección
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Icon
                    weight={500}
                    name="location_on"
                    size={16}
                    className="mt-0.5 shrink-0 text-brand"
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
            className="bg-surface"
            style={{
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
                <Icon weight={500} name="shopping_bag" size={16} />
                <span>
                  Pedido ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="font-mono">{soles(order.total)}</span>
                <Icon
                  weight={500}
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  className="text-ink-muted"
                />
              </div>
            </summary>
            <div className="border-t border-border" style={{ marginTop: 8, paddingTop: 8 }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  className={cn(
                    i < items.length - 1 ? 'border-b border-border' : 'border-b border-transparent',
                  )}
                  style={{ padding: '5px 0' }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span
                      className="font-mono text-ink-muted"
                      style={{
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
                        <div className="text-ink-muted" style={{ fontSize: 12 }}>
                          {it.mods}
                        </div>
                      )}
                      {it.note && (
                        <div className="text-amber-700" style={{ fontSize: 12, marginTop: 2 }}>
                          <Icon weight={500} name="info" size={11} /> {it.note}
                        </div>
                      )}
                    </div>
                    <span
                      className="font-mono text-ink-muted"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {soles(it.price)}
                    </span>
                  </div>
                </div>
              ))}
              <div
                className="border-t border-border"
                style={{
                  marginTop: 10,
                  padding: '8px 0 0',
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
            className="bg-surface"
            style={{
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
                <Icon weight={500} name="payments" size={16} />
                <span>Cobro</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="font-mono">{soles(order.total)}</span>
                <Icon
                  weight={500}
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  className="text-ink-muted"
                />
              </div>
            </summary>
            <div
              className="border-t border-border"
              style={{
                marginTop: 8,
                paddingTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <Row label="Total del pedido" value={soles(order.amount)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee)} mono />
              <div className="h-px bg-border" style={{ margin: '2px 0' }} />
              <Row label="Total a cobrar" value={soles(order.total)} mono bold />
            </div>
          </details>
        )}

        {/* Sección de pago */}
        {order.payment === 'pending_cash' && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet order={order} qrUrl={qrUrl} />}
        {order.payment === 'prepaid' && (
          <>
            {isLoadingActions ? (
              <div
                className="bg-gray-100 border border-gray-200 animate-pulse"
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  height: 64,
                }}
              />
            ) : (
              <>
                {/* 1. Esperando comprobante del cliente (pending_acceptance o validando sin comprobante aún) */}
                {isPrepaidAwaitingProof && (
                  <div
                    className="bg-brand-soft border border-orange-200"
                    style={{
                      borderRadius: 12,
                      padding: '12px 14px',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <Icon
                        weight={500}
                        name="qr_code_2"
                        size={18}
                        filled
                        className="text-orange-700"
                      />
                      <div className="text-orange-800" style={{ fontSize: 13, fontWeight: 700 }}>
                        Pago por Yape / Plin
                      </div>
                    </div>
                    <div className="text-brand-dark" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Confirma la disponibilidad de insumos para este pedido. Una vez aceptado, el
                      cliente tendrá 10 minutos para transferir por Yape/Plin y adjuntar el
                      comprobante.
                    </div>
                  </div>
                )}
                {/* 2. awaiting_payment: Banner de espera tras haber aceptado disponibilidad */}
                {order.status === 'awaiting_payment' && (
                  <div
                    className="bg-brand-soft border border-orange-200"
                    style={{
                      borderRadius: 12,
                      padding: '12px 14px',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <Icon
                        weight={500}
                        name="schedule"
                        size={18}
                        filled
                        className="text-orange-700"
                      />
                      <div className="text-orange-800" style={{ fontSize: 13, fontWeight: 700 }}>
                        Esperando pago del cliente
                      </div>
                    </div>
                    <div className="text-brand-dark" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Disponibilidad confirmada. El cliente tiene 10 minutos para realizar la
                      transferencia por Yape/Plin y adjuntar el comprobante.
                    </div>
                  </div>
                )}
                {/* 3. Con comprobante subido: Guía de validación + comprobante + botones */}
                {isValidandoPrepaid && (
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
          </>
        )}
        {order.payment === 'pending_mixed' && <PaySectionMixed order={order} qrUrl={qrUrl} />}

        {/* Prep picker (al aceptar) */}
        {showPrepPicker && (
          <div
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Tiempo de preparación
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
                  className={cn(
                    m === prep
                      ? 'bg-ink text-white border-transparent'
                      : 'bg-white text-ink border border-border',
                  )}
                  style={{
                    flexShrink: 0,
                    minWidth: 50,
                    fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
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
          <div
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              ¿Necesitas más tiempo?
            </div>
            <button
              type="button"
              onClick={() => actions.onExtend()}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="add" size={14} /> +10 min
            </button>
            <div className="text-ink-muted" style={{ fontSize: 11, marginTop: 6 }}>
              Solo disponible una vez y antes de que llegue el motorizado.
            </div>
          </div>
        )}
        {order.state === 'cooking' && order.extensionUsed && (
          <div
            className="text-warning"
            style={{
              fontSize: 12,
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
            onClick={() => actions.onCallDriver?.(order)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-danger px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Icon weight={500} name="call" size={15} /> Llamar a un motorizado manualmente
          </button>
        )}

        {/* Otras acciones */}
        {!isPending && order.state !== 'picked_up' && (
          <div
            className="bg-surface border border-border"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div
              className="text-ink-muted"
              style={{
                fontSize: 10,
                fontWeight: 700,
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-danger bg-transparent px-3 py-2 text-[13px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="cancel" size={14} /> Cancelar este pedido
            </button>
          </div>
        )}
      </div>

      {/* Footer de acciones (pendiente) */}
      {(isPending || isLoadingActions) && (
        <div
          className="bg-white border-t border-border shadow-elev-2"
          style={{
            padding: '12px 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isLoadingActions ? (
            <div style={{ display: 'flex', gap: 10, opacity: 0.7 }} className="animate-pulse">
              <div
                className="bg-gray-200"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                }}
              />
              <div
                className="bg-gray-200"
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: 12,
                }}
              />
            </div>
          ) : isValidandoPrepaid ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => actions.onRejectProof()}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-danger/30 bg-danger-soft px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="cancel" size={18} /> Inválido
              </button>
              <button
                type="button"
                onClick={() => setShowPrepModal(true)}
                disabled={busy}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="check_circle" size={18} filled /> Confirmar pago
              </button>
            </div>
          ) : order.status === 'awaiting_payment' && isPrepaid ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModal('cancel')}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="close" size={18} /> Cancelar
              </button>
              <div className="inline-flex flex-[2] cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-5 py-3 text-[15px] font-semibold text-gray-400 pointer-events-none">
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
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="close" size={18} /> Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => actions.onAccept(isPrepaid ? 20 : prep)}
                  disabled={acceptDisabled}
                  className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="check" size={18} filled />
                  {isPrepaid ? 'Aceptar disponibilidad' : `Aceptar · ${prep}m`}
                </button>
              </div>
              {isPrepaid && (
                <div className="text-ink-muted" style={{ fontSize: 11, textAlign: 'center' }}>
                  Confirmas disponibilidad para preparar. El cliente procederá a realizar el pago
                  por Yape/Plin.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer cocina: declarar la comida lista.
          Visible en los cuatro estados en los que la comida puede seguir en
          cocina, no solo en `preparing`: desde que el motorizado toma el pedido
          con 10 minutos por delante, el caso normal es que llegue antes de que
          la comida salga. */}
      {(order.canMarkReady || order.readyEarly) && (
        <div
          className="bg-white border-t border-border shadow-elev-2"
          style={{
            padding: '12px 14px 14px',
            flexShrink: 0,
          }}
        >
          {order.readyEarly ? (
            <div
              className="bg-success-soft border border-success"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
              }}
            >
              <Icon weight={500} name="check_circle" size={20} filled className="text-success" />
              <span className="text-green-700" style={{ fontSize: 13, fontWeight: 600 }}>
                Comida lista. El motorizado ya lo sabe.
              </span>
            </div>
          ) : confirmReady ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmReady(false)}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await actions.onReady()
                  setConfirmReady(false)
                }}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="check_circle" size={18} filled /> Sí, está lista
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReady(true)}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="inventory_2" size={18} filled /> Listo — llamar moto
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (mobile) {
    return (
      <div className="bg-white" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
        {content}
      </div>
    )
  }

  return (
    <div
      onClick={actions.onClose}
      className="bg-black/45"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white shadow-elev-3"
        style={{
          width: 420,
          maxWidth: '100vw',
          height: '100vh',
          maxHeight: '100vh',
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
      className="bg-black/45"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="bg-white shadow-elev-4"
        style={{
          borderRadius: 20,
          padding: 20,
          maxWidth: 340,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            className="bg-warning-soft text-amber-800"
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="pause_circle" size={22} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Pausar pedidos</div>
            <div className="text-ink-muted" style={{ fontSize: 12, marginTop: 1 }}>
              ¿Por cuánto tiempo?
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {PAUSE_OPTS.map((o, i) => (
            <button
              type="button"
              key={o.label}
              onClick={() => setSel(i)}
              className={cn(
                'border-transparent',
                i === sel ? 'bg-ink text-white' : 'bg-surface text-ink',
              )}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 9,
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                <div className="text-ink-muted" style={{ fontSize: 11, opacity: 0.65 }}>
                  {o.sub}
                </div>
              </div>
              {i === sel && <Icon weight={500} name="check" size={16} />}
            </button>
          ))}
        </div>

        <div
          className="bg-warning-soft text-amber-800"
          style={{
            borderRadius: 9,
            padding: '9px 12px',
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <strong>Los pedidos activos continúan</strong> su flujo. Solo se bloquean los nuevos desde
          la web.
        </div>
        <button
          type="button"
          onClick={() => onConfirm(PAUSE_OPTS[sel]?.min ?? null)}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {PAUSE_OPTS[sel]?.min
            ? `Confirmar pausa de ${PAUSE_OPTS[sel]?.label.toLowerCase()}`
            : 'Confirmar pausa'}
        </button>
      </div>
    </div>
  )
}
