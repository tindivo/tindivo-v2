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

interface ReportDetail {
  id: string
  type: string
  reason: string
  resolutionNotes: string | null
  evidenceUrls: string[]
  data: Record<string, unknown> | null
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

// ── RefundDetailModal ────────────────────────────────────────────────────────
function RefundDetailModal({
  charge,
  onClose,
}: {
  charge: PendingCharge
  onClose: () => void
}) {
  const r = charge.report
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
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          padding: '18px 20px',
          border: '1px solid #eae7e2',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #eae7e2',
            paddingBottom: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--tv-ink)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>↩️</span> Detalle de Devolución
            </div>
            {charge.shortId && (
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
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
              fontSize: 18,
              cursor: 'pointer',
              color: 'var(--tv-ink-subtle)',
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              background: '#fff4ec',
              borderRadius: 12,
              padding: 12,
              border: '1px solid #fed7aa',
            }}
          >
            <div className="tv-label" style={{ fontSize: 10, color: 'var(--tv-brand-dark)' }}>
              CONCEPTO DEL CARGO
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink)', marginTop: 2 }}>
              {charge.description || 'Cargo por devolución al cliente'}
            </div>
            <div
              className="tv-mono"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--tv-danger)',
                marginTop: 4,
              }}
            >
              {soles(charge.amount)}
            </div>
          </div>

          {r && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  background: 'var(--tv-surface)',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid #eae7e2',
                }}
              >
                <div className="tv-label" style={{ fontSize: 10 }}>
                  MOTIVO DE LA APELACIÓN
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--tv-ink)',
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {r.reason || r.type}
                </div>
              </div>

              {r.resolutionNotes && (
                <div
                  style={{
                    background: '#fef3c7',
                    borderRadius: 12,
                    padding: 12,
                    border: '1px solid #fde68a',
                    color: '#92400e',
                  }}
                >
                  <div className="tv-label" style={{ fontSize: 10, color: '#b45309' }}>
                    RESOLUCIÓN DE ADMINISTRACIÓN
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                    {r.resolutionNotes}
                  </div>
                </div>
              )}

              {r.evidenceUrls && r.evidenceUrls.length > 0 && (
                <div>
                  <div className="tv-label" style={{ fontSize: 10, marginBottom: 6 }}>
                    COMPROBANTES ADJUNTOS ({r.evidenceUrls.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {r.evidenceUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid #eae7e2',
                          background: 'var(--tv-surface)',
                          textDecoration: 'none',
                        }}
                      >
                        <img
                          src={url}
                          alt={`Evidencia ${i + 1}`}
                          style={{ width: '100%', height: 110, objectFit: 'cover' }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: '1px solid #eae7e2',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="tv-btn tv-btn-sm"
            style={{ background: 'var(--tv-ink)', color: '#fff' }}
            onClick={onClose}
          >
            Cerrar
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
