'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { DashboardShell } from '@/components/dashboard/shell'
import { api } from '@/lib/api'

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.problem.detail ?? e.message
  if (e instanceof Error) return e.message
  return 'Ocurrió un error inesperado'
}

const BLOCK_THRESHOLD = 300

interface ReportOrder {
  id: string
  shortId: string
  orderAmount: number
  createdAt: string
  rejectionReasonCode: string | null
  rejectionReasonText: string | null
  customerName: string | null
  customerPhone: string | null
}

interface ReportTimelineEvent {
  eventType: string
  actorRole: string | null
  createdAt: string
  data: Record<string, unknown>
  proofUrls?: { url: string; label: string }[]
}

interface ReportDetail {
  id: string
  type: string
  reason: string
  resolutionNotes: string | null
  refundAmount: number | null
  appealStatus: string | null
  createdAt: string
  refundProofUrl: string | null
  disputeProofUrl: string | null
  evidenceUrls: string[]
  order: ReportOrder | null
  events: ReportTimelineEvent[]
}

interface PendingCharge {
  id: string
  chargeType: 'commission' | 'delivery_fee' | 'refund_charge'
  amount: number
  description: string | null
  createdAt: string
  orderId: string | null
  shortId: string | null
  reportId: string | null
  report: ReportDetail | null
}

interface PendingGroupItem {
  key: string
  type: 'order' | 'refund'
  orderId: string | null
  shortId: string | null
  createdAt: string
  charges: PendingCharge[]
  totalAmount: number
}

interface PaymentHistoryItem {
  id: string
  amount: number
  paymentMethod: string
  paidAt: string
  note: string | null
  settledChargeCount: number
  orderCount: number
}

interface AccountSummaryData {
  balanceDue: number
  isBlocked: boolean
  blockedForDebt: boolean
  supportPhone: string | null
  summary: {
    totalCommissions: number
    totalDeliveryFees: number
    totalRefunds: number
  }
  pendingCharges: PendingCharge[]
  paymentHistory: PaymentHistoryItem[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const REJECTION_LABELS: Record<string, string> = {
  invalid_proof: 'Comprobante de pago inválido',
  out_of_stock: 'Sin stock / Productos no disponibles',
  closed: 'Local/Restaurante cerrado',
  out_of_zone: 'Dirección fuera de zona de entrega',
  no_answer: 'Cliente no responde al contacto',
  other: 'Otro motivo de rechazo',
}

const EVENT_LABELS: Record<string, string> = {
  'order.created': 'Pedido creado',
  'order.status_changed': 'Estado cambiado',
  'order.prepay_proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_rejected': 'Restaurante rechazó el comprobante',
  'order.validation_failed_retry': 'Restaurante rechazó el comprobante',
  'order.validation_failed': 'Rechazo definitivo — pedido cancelado',
  'order.validation_passed': 'Comprobante confirmado',
  'order.proof_confirmed': 'Comprobante confirmado',
  'order.cancelled': 'Pedido cancelado',
  'order.appeal_created': 'Cliente inició apelación',
  'order.appeal_in_review': 'Admin marcó en revisión',
  'order.appeal_resolved': 'Apelación resuelta',
  'order.refund_registered': 'Devolución registrada',
  'order.contingency_advance': 'Devolución registrada',
  'order.fallback_review_created': 'Revisión automática (sin apelación 24h)',
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <button
        type="button"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 99,
          background: 'rgba(255, 255, 255, 0.2)',
          color: '#fff',
          border: 'none',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        style={{
          maxHeight: '90vh',
          maxWidth: '90vw',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          objectFit: 'contain',
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function ProofThumbnailCard({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 12,
          border: '1px solid #eae7e2',
          background: 'var(--tv-surface)',
          padding: 8,
          textAlign: 'left',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        <img
          src={url}
          alt={label}
          style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid #eae7e2' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--tv-brand)', textDecoration: 'underline', marginTop: 2 }}>
            Toca para ampliar →
          </div>
        </div>
      </button>
      {open && <ImageLightbox src={url} alt={label} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── RefundDetailModal ────────────────────────────────────────────────────────
function RefundDetailModal({
  charge,
  onClose,
}: {
  charge: PendingCharge
  onClose: () => void
}) {
  const r = charge.report
  const order = r?.order
  const [timelineOpen, setTimelineOpen] = useState(false)

  const rejectionText =
    order?.rejectionReasonCode && REJECTION_LABELS[order.rejectionReasonCode]
      ? REJECTION_LABELS[order.rejectionReasonCode]
      : order?.rejectionReasonText || 'Comprobante no válido'

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="document"
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 540,
          padding: '20px 22px',
          border: '1px solid #eae7e2',
          boxShadow: '0 12px 36px rgba(0,0,0,0.16)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #eae7e2',
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--tv-ink)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>↩️</span> Detalle de Devolución
              <span
                style={{
                  background: '#dcfce7',
                  color: '#15803d',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 99,
                }}
              >
                Devuelto
              </span>
            </div>
            {charge.shortId && (
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 3 }}>
                Pedido{' '}
                <span className="tv-mono" style={{ fontWeight: 700, color: 'var(--tv-brand)' }}>
                  #{charge.shortId}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--tv-ink-subtle)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            paddingRight: 2,
          }}
        >
          {/* CONTEXTO DEL CASO */}
          <div
            style={{
              background: 'var(--tv-surface)',
              borderRadius: 14,
              padding: 14,
              border: '1px solid #eae7e2',
            }}
          >
            <div className="tv-label" style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', marginBottom: 10 }}>
              CONTEXTO DEL CASO
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', textTransform: 'uppercase' }}>
                  Pedido
                </div>
                <div className="tv-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tv-brand)' }}>
                  #{charge.shortId || order?.shortId || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', textTransform: 'uppercase' }}>
                  Monto del Pedido
                </div>
                <div className="tv-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tv-ink)' }}>
                  {order?.orderAmount ? soles(order.orderAmount) : soles(charge.amount)}
                </div>
              </div>

              {order?.customerName && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', textTransform: 'uppercase' }}>
                    Cliente
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink)' }}>
                    {order.customerName}
                  </div>
                </div>
              )}

              {order?.createdAt && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', textTransform: 'uppercase' }}>
                    Creado
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                    {fmtDate(order.createdAt)}
                  </div>
                </div>
              )}

              {r?.createdAt && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', textTransform: 'uppercase' }}>
                    Apelación
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                    {fmtDate(r.createdAt)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* EL CONFLICTO */}
          <div
            style={{
              background: '#fff5f5',
              borderRadius: 14,
              padding: 14,
              border: '1px solid #fed7d7',
            }}
          >
            <div className="tv-label" style={{ fontSize: 10, color: '#c53030', marginBottom: 6 }}>
              EL CONFLICTO
            </div>

            {/* Motivo de rechazo del restaurante */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9b2c2c' }}>
                MOTIVO DE RECHAZO DEL RESTAURANTE
              </div>
              <div style={{ fontSize: 13, color: '#742a2a', marginTop: 2, fontWeight: 500 }}>
                {rejectionText}
              </div>
            </div>

            {/* Argumento del cliente al apelar */}
            {r?.reason && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9b2c2c' }}>
                  ARGUMENTO DEL CLIENTE AL APELAR
                </div>
                <div style={{ fontSize: 13, color: '#4a5568', fontStyle: 'italic', marginTop: 2 }}>
                  "{r.reason}"
                </div>
              </div>
            )}

            {/* Comprobante en disputa (último intento) */}
            {r?.disputeProofUrl && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9b2c2c', marginBottom: 6 }}>
                  COMPROBANTE EN DISPUTA
                </div>
                <ProofThumbnailCard url={r.disputeProofUrl} label="Comprobante en disputa" />
              </div>
            )}
          </div>

          {/* DEVOLUCIÓN COMPLETADA */}
          <div
            style={{
              background: '#f0fdf4',
              borderRadius: 14,
              padding: 14,
              border: '1px solid #bbf7d0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> ¡Devolución completada!
              </div>
              <div className="tv-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--tv-danger)' }}>
                Se devolvió {soles(charge.amount)}
              </div>
            </div>

            {/* Captura del Yape de devolución enviado por el admin */}
            {r?.refundProofUrl && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                  CAPTURA DEL YAPE / PLIN ENVIADO AL CLIENTE
                </div>
                <ProofThumbnailCard url={r.refundProofUrl} label="Yape de devolución al cliente" />
              </div>
            )}

            {/* Nota de resolución */}
            {r?.resolutionNotes && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #dcfce7' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>
                  NOTA DE RESOLUCIÓN DE ADMINISTRACIÓN
                </div>
                <div style={{ fontSize: 13, color: '#14532d', marginTop: 2, fontWeight: 500 }}>
                  {r.resolutionNotes}
                </div>
              </div>
            )}
          </div>

          {/* HISTORIAL DEL PEDIDO (Collapsible Timeline) */}
          {r?.events && r.events.length > 0 && (
            <div
              style={{
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #eae7e2',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--tv-surface)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="tv-label" style={{ fontSize: 10, color: 'var(--tv-ink-subtle)' }}>
                  HISTORIAL DEL PEDIDO
                </span>
                <span style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                  {timelineOpen ? '▲' : '▼'}
                </span>
              </button>

              {timelineOpen && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {r.events.map((ev, i) => {
                    const label = EVENT_LABELS[ev.eventType] || ev.eventType
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 99,
                            background: 'var(--tv-brand)',
                            marginTop: 4,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--tv-ink)' }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'var(--tv-ink-subtle)' }}>
                            {fmtDate(ev.createdAt)} · {ev.actorRole || 'sistema'}
                          </div>

                          {ev.proofUrls && ev.proofUrls.length > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                              {ev.proofUrls.map((p, pIdx) => (
                                <ProofThumbnailCard key={pIdx} url={p.url} label={p.label} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid #eae7e2',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="tv-btn tv-btn-sm"
            style={{ background: 'var(--tv-ink)', color: '#fff', padding: '6px 16px', borderRadius: 10 }}
            onClick={onClose}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main DeudaPage ───────────────────────────────────────────────────────────
export default function DeudaPage() {
  const [data, setData] = useState<AccountSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mainTab, setMainTab] = useState<'pending' | 'history'>('pending')
  const [typeFilter, setTypeFilter] = useState<'all' | 'orders' | 'refunds'>('all')
  const [selectedRefund, setSelectedRefund] = useState<PendingCharge | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: AccountSummaryData }>('/business/account/summary')
      setData(res.data)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Agrupar cargos pendientes por order_id en frontend
  const groupedUnits = useMemo(() => {
    if (!data?.pendingCharges) return []

    const map = new Map<string, PendingGroupItem>()

    for (const c of data.pendingCharges) {
      if (c.chargeType === 'refund_charge' || !c.orderId) {
        const key = `refund_${c.id}`
        map.set(key, {
          key,
          type: 'refund',
          orderId: c.orderId,
          shortId: c.shortId,
          createdAt: c.createdAt,
          charges: [c],
          totalAmount: c.amount,
        })
      } else {
        const key = `order_${c.orderId}`
        if (!map.has(key)) {
          map.set(key, {
            key,
            type: 'order',
            orderId: c.orderId,
            shortId: c.shortId,
            createdAt: c.createdAt,
            charges: [],
            totalAmount: 0,
          })
        }
        const grp = map.get(key)!
        grp.charges.push(c)
        grp.totalAmount += c.amount
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [data?.pendingCharges])

  const filteredGroups = useMemo(() => {
    return groupedUnits.filter((g) => {
      if (typeFilter === 'all') return true
      if (typeFilter === 'orders') return g.type === 'order'
      if (typeFilter === 'refunds') return g.type === 'refund'
      return true
    })
  }, [groupedUnits, typeFilter])

  const balance = data?.balanceDue ?? 0
  const pct = Math.min(balance / BLOCK_THRESHOLD, 1) * 100
  const whatsappNumber = data?.supportPhone ? data.supportPhone.replace(/\D/g, '') : ''
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola Tindivo, quiero coordinar el pago de mi deuda.')}`
    : '#'

  return (
    <DashboardShell
      active="deuda"
      title="Mi cuenta"
      subtitle="Cuenta y cargos pendientes"
      headerRight={
        <div className="hidden lg:block">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="tv-btn tv-btn-brand"
            style={{ textDecoration: 'none' }}
          >
            <MS name="chat" size={18} /> WhatsApp a Tindivo
          </a>
        </div>
      }
    >
      {/* Banner de Suspensión por deuda */}
      {data?.isBlocked && (
        <div
          style={{
            background: 'var(--tv-danger-soft)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--tv-danger)',
            fontSize: 14,
            fontWeight: 600,
            border: '1px solid #fee2e2',
          }}
        >
          <MS name="block" size={18} filled style={{ flexShrink: 0 }} />
          Tu cuenta está suspendida por deuda acumulada. Coordina tu pago para reactivar el servicio.
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: 'var(--tv-danger)', marginBottom: 12 }}>{error}</p>}

      {loading || !data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{ height: 140, borderRadius: 12, background: 'var(--tv-surface)' }}
            className="animate-pulse"
          />
          <div
            style={{ height: 200, borderRadius: 12, background: 'var(--tv-surface)' }}
            className="animate-pulse"
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Hero de Deuda Acumulada */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1A1614 0%, #2A2422 100%)',
              color: '#fff',
              borderRadius: 16,
              padding: '20px 18px',
            }}
          >
            <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>
              DEBES AHORA
            </div>
            <div
              className="tv-mono"
              style={{
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1,
                margin: '6px 0 14px',
              }}
            >
              {soles(balance)}
            </div>

            {/* Barra de límite de suspensión */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                  marginBottom: 4,
                }}
              >
                <span>0</span>
                <span>Suspensión a {soles(BLOCK_THRESHOLD)}</span>
              </div>
              <div
                style={{
                  height: 6,
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: pct >= 80 ? 'var(--tv-danger)' : 'var(--tv-brand)',
                    transition: 'width 600ms ease',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Desglose Transparente por Tipo de Cargo (Tarjetas con 1px solid #eae7e2) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '10px 12px',
                border: '1px solid #eae7e2',
              }}
            >
              <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
                📦 COMISIONES TINDIVO
              </div>
              <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>
                {soles(data.summary.totalCommissions)}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '10px 12px',
                border: '1px solid #eae7e2',
              }}
            >
              <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
                🛵 DELIVERY FEES
              </div>
              <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>
                {soles(data.summary.totalDeliveryFees)}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '10px 12px',
                border: '1px solid #eae7e2',
              }}
            >
              <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
                ↩️ DEVOLUCIONES
              </div>
              <div
                className="tv-mono"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: data.summary.totalRefunds > 0 ? 'var(--tv-danger)' : 'var(--tv-ink)',
                }}
              >
                {soles(data.summary.totalRefunds)}
              </div>
            </div>
          </div>

          {/* Botón WhatsApp Mobile */}
          <div className="lg:hidden">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg"
              style={{ textDecoration: 'none' }}
            >
              <MS name="chat" size={18} /> Pagar por WhatsApp a Tindivo
            </a>
          </div>

          {/* ── Main Navigation Tabs ────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--tv-surface)',
              borderRadius: 12,
              padding: 4,
              border: '1px solid #eae7e2',
            }}
          >
            <button
              type="button"
              onClick={() => setMainTab('pending')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: mainTab === 'pending' ? '#fff' : 'transparent',
                color: mainTab === 'pending' ? 'var(--tv-ink)' : 'var(--tv-ink-muted)',
                boxShadow: mainTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 200ms ease',
              }}
            >
              <span>Cargos pendientes</span>
              {groupedUnits.length > 0 && (
                <span
                  style={{
                    background: mainTab === 'pending' ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 99,
                    padding: '1px 6px',
                  }}
                >
                  {groupedUnits.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMainTab('history')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: mainTab === 'history' ? '#fff' : 'transparent',
                color: mainTab === 'history' ? 'var(--tv-ink)' : 'var(--tv-ink-muted)',
                boxShadow: mainTab === 'history' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 200ms ease',
              }}
            >
              <span>Historial de pagos</span>
              {data.paymentHistory.length > 0 && (
                <span
                  style={{
                    background: mainTab === 'history' ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 99,
                    padding: '1px 6px',
                  }}
                >
                  {data.paymentHistory.length}
                </span>
              )}
            </button>
          </div>

          {/* ── TAB 1: CARGOS PENDIENTES ───────────────────────────────────── */}
          {mainTab === 'pending' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MS name="receipt_long" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Detalle de pendientes</div>
                  <span className="tv-chip" style={{ fontSize: 11 }}>
                    {groupedUnits.length} {groupedUnits.length === 1 ? 'pedido' : 'pedidos'}
                  </span>
                </div>

                {/* Sub-Filtros: [Todos] [Pedidos] [Devoluciones] */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(
                    [
                      { key: 'all', label: 'Todos' },
                      { key: 'orders', label: 'Pedidos' },
                      { key: 'refunds', label: 'Devoluciones' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setTypeFilter(f.key)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: typeFilter === f.key ? 'var(--tv-ink)' : 'var(--tv-surface)',
                        color: typeFilter === f.key ? '#fff' : 'var(--tv-ink-muted)',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredGroups.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px 16px',
                    color: 'var(--tv-ink-subtle)',
                    fontSize: 13,
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #eae7e2',
                  }}
                >
                  No hay ítems pendientes en este filtro.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredGroups.map((g) => {
                    if (g.type === 'order') {
                      const breakdown = g.charges
                        .map((c) =>
                          c.chargeType === 'delivery_fee'
                            ? `Delivery Fee ${soles(c.amount)}`
                            : `Comisión ${soles(c.amount)}`,
                        )
                        .join(' + ')

                      return (
                        <div
                          key={g.key}
                          style={{
                            background: '#fff',
                            borderRadius: 12,
                            padding: '10px 12px',
                            border: '1px solid #eae7e2',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div style={{ fontSize: 16 }}>🛵</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {g.shortId && (
                                <span
                                  className="tv-mono"
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: 'var(--tv-brand)',
                                  }}
                                >
                                  #{g.shortId}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: 'var(--tv-ink-subtle)' }}>
                                · {fmtDate(g.createdAt)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--tv-ink-muted)',
                                marginTop: 2,
                              }}
                            >
                              {breakdown}
                            </div>
                          </div>
                          <div
                            className="tv-mono"
                            style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-ink)' }}
                          >
                            {soles(g.totalAmount)}
                          </div>
                        </div>
                      )
                    }

                    const rf = g.charges[0]
                    return (
                      <div
                        key={g.key}
                        style={{
                          background: '#fff',
                          borderRadius: 12,
                          padding: '10px 12px',
                          border: '1px solid #eae7e2',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 16 }}>↩️</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink)' }}>
                              Devolución al cliente
                            </span>
                            {g.shortId && (
                              <span
                                className="tv-mono"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: 'var(--tv-brand)',
                                }}
                              >
                                #{g.shortId}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--tv-ink-subtle)' }}>
                              · {fmtDate(g.createdAt)}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--tv-ink-muted)',
                              marginTop: 2,
                            }}
                          >
                            {rf?.description || 'Devolución por apelación / cancelación'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {rf && (
                            <button
                              type="button"
                              onClick={() => setSelectedRefund(rf)}
                              className="tv-btn tv-btn-sm"
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                background: 'var(--tv-surface)',
                                color: 'var(--tv-ink)',
                              }}
                            >
                              Ver detalle
                            </button>
                          )}
                          <div
                            className="tv-mono"
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: 'var(--tv-danger)',
                            }}
                          >
                            {soles(g.totalAmount)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: HISTORIAL DE PAGOS ──────────────────────────────────── */}
          {mainTab === 'history' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
                <div style={{ fontSize: 15, fontWeight: 700 }}>Pagos confirmados</div>
              </div>

              {data.paymentHistory.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px 16px',
                    color: 'var(--tv-ink-subtle)',
                    fontSize: 13,
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #eae7e2',
                  }}
                >
                  Aún no hay pagos registrados en tu historial.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.paymentHistory.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: '#fff',
                        borderRadius: 12,
                        border: '1px solid #eae7e2',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="tv-chip tv-chip-success"
                            style={{ fontSize: 10, textTransform: 'uppercase' }}
                          >
                            {p.paymentMethod}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                            {fmtDate(p.paidAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                          Saldó {p.settledChargeCount} cargos ({p.orderCount} pedidos)
                          {p.note && ` · ${p.note}`}
                        </div>
                      </div>

                      <div
                        className="tv-mono"
                        style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-success)' }}
                      >
                        {soles(p.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalle de Devolución */}
      {selectedRefund && (
        <RefundDetailModal charge={selectedRefund} onClose={() => setSelectedRefund(null)} />
      )}
    </DashboardShell>
  )
}
