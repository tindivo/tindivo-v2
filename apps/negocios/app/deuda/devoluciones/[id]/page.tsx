'use client'

import { ApiError } from '@tindivo/api-client'
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@tindivo/ui'
import { MS, soles } from '@/components/dashboard/primitives'
import { DashboardShell } from '@/components/dashboard/shell'
import { api } from '@/lib/api'

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

interface RefundDetail {
  id: string
  type: string
  reason: string
  resolutionNotes: string | null
  refundAmount: number
  appealStatus: string | null
  createdAt: string
  refundProofUrl: string | null
  disputeProofUrl: string | null
  evidenceUrls: string[]
  chargeAmount: number
  chargeDescription: string
  order: ReportOrder | null
  events: ReportTimelineEvent[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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
          padding: 10,
          textAlign: 'left',
          width: '100%',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
      >
        <img
          src={url}
          alt={label}
          style={{
            width: 68,
            height: 68,
            borderRadius: 10,
            objectFit: 'cover',
            border: '1px solid #eae7e2',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tv-ink)' }}>{label}</div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--tv-brand)',
              textDecoration: 'underline',
              marginTop: 3,
            }}
          >
            Toca para ampliar →
          </div>
        </div>
      </button>
      {open && <ImageLightbox src={url} alt={label} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function DevolucionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<RefundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: RefundDetail }>(`/business/account/refunds/${id}`)
      setData(res.data)
    } catch (e) {
      if (e instanceof ApiError) setError(e.problem.detail ?? e.message)
      else if (e instanceof Error) setError(e.message)
      else setError('Ocurrió un error inesperado')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const order = data?.order
  const rejectionText =
    order?.rejectionReasonCode && REJECTION_LABELS[order.rejectionReasonCode]
      ? REJECTION_LABELS[order.rejectionReasonCode]
      : order?.rejectionReasonText || 'Comprobante no válido'

  return (
    <DashboardShell
      active="deuda"
      title="Detalle de Devolución"
      subtitle={
        data?.order?.shortId ? `Pedido #${data.order.shortId}` : 'Información y transparencia'
      }
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Volver */}
        <div>
          <Link
            href="/deuda"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--tv-brand)',
              textDecoration: 'none',
            }}
          >
            ← Volver a Mi cuenta
          </Link>
        </div>

        {loading ? (
          <LoadingState
            variant="card"
            label="Cargando detalle de la devolución…"
            icon="receipt_long"
            className="my-6"
          />
        ) : error || !data ? (
          <div
            style={{
              background: '#fef2f2',
              borderRadius: 14,
              padding: 20,
              border: '1px solid #fecaca',
              color: '#991b1b',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>No se pudo cargar la devolución</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{error || 'Información no disponible'}</div>
          </div>
        ) : (
          <>
            {/* Header Card */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #eae7e2',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>↩️</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-ink)' }}>
                    Devolución al Cliente
                  </span>
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
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                  {data.chargeDescription}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div className="tv-label" style={{ fontSize: 10, color: 'var(--tv-ink-subtle)' }}>
                  MONTO DEBITADO
                </div>
                <div
                  className="tv-mono"
                  style={{ fontSize: 22, fontWeight: 700, color: 'var(--tv-danger)' }}
                >
                  {soles(data.chargeAmount)}
                </div>
              </div>
            </div>

            {/* CONTEXTO DEL CASO */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #eae7e2',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div
                className="tv-label"
                style={{ fontSize: 10, color: 'var(--tv-ink-subtle)', marginBottom: 12 }}
              >
                CONTEXTO DEL CASO
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--tv-ink-subtle)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Pedido
                  </div>
                  <div
                    className="tv-mono"
                    style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-brand)' }}
                  >
                    #{order?.shortId || '—'}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--tv-ink-subtle)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Monto del Pedido
                  </div>
                  <div
                    className="tv-mono"
                    style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-ink)' }}
                  >
                    {order?.orderAmount ? soles(order.orderAmount) : soles(data.chargeAmount)}
                  </div>
                </div>

                {order?.customerName && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--tv-ink-subtle)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Cliente
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tv-ink)' }}>
                      {order.customerName}
                    </div>
                  </div>
                )}

                {order?.createdAt && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--tv-ink-subtle)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Creado
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)' }}>
                      {fmtDate(order.createdAt)}
                    </div>
                  </div>
                )}

                {data.createdAt && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--tv-ink-subtle)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Apelación
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)' }}>
                      {fmtDate(data.createdAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* EL CONFLICTO */}
            <div
              style={{
                background: '#fff5f5',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #fed7d7',
              }}
            >
              <div
                className="tv-label"
                style={{ fontSize: 10, color: '#c53030', marginBottom: 10 }}
              >
                EL CONFLICTO
              </div>

              {/* Motivo de rechazo del restaurante */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#9b2c2c',
                    textTransform: 'uppercase',
                  }}
                >
                  Motivo de rechazo del restaurante
                </div>
                <div style={{ fontSize: 14, color: '#742a2a', marginTop: 2, fontWeight: 600 }}>
                  {rejectionText}
                </div>
              </div>

              {/* Argumento del cliente al apelar */}
              {data.reason && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#9b2c2c',
                      textTransform: 'uppercase',
                    }}
                  >
                    Argumento del cliente al apelar
                  </div>
                  <div
                    style={{ fontSize: 13, color: '#4a5568', fontStyle: 'italic', marginTop: 3 }}
                  >
                    "{data.reason}"
                  </div>
                </div>
              )}

              {/* Comprobante en disputa (último intento) */}
              {data.disputeProofUrl && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#9b2c2c',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    Comprobante en disputa (último intento)
                  </div>
                  <ProofThumbnailCard
                    url={data.disputeProofUrl}
                    label="Comprobante subido por el cliente"
                  />
                </div>
              )}
            </div>

            {/* DEVOLUCIÓN COMPLETADA */}
            <div
              style={{
                background: '#f0fdf4',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #bbf7d0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#166534',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>✓</span> ¡Devolución completada!
                </div>
                <div
                  className="tv-mono"
                  style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-danger)' }}
                >
                  Se devolvió {soles(data.refundAmount)}
                </div>
              </div>

              {/* Captura del Yape de devolución enviado por el admin */}
              {data.refundProofUrl && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#15803d',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    Captura del Yape / Plin enviado al cliente
                  </div>
                  <ProofThumbnailCard
                    url={data.refundProofUrl}
                    label="Comprobante de devolución del Admin"
                  />
                </div>
              )}

              {/* Nota de resolución */}
              {data.resolutionNotes && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #dcfce7' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#166534',
                      textTransform: 'uppercase',
                    }}
                  >
                    Nota de resolución de Administración
                  </div>
                  <div style={{ fontSize: 13, color: '#14532d', marginTop: 3, fontWeight: 500 }}>
                    {data.resolutionNotes}
                  </div>
                </div>
              )}
            </div>

            {/* HISTORIAL DEL PEDIDO (Collapsible Timeline) */}
            {data.events && data.events.length > 0 && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: '1px solid #eae7e2',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setTimelineOpen((v) => !v)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--tv-surface)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="tv-label"
                    style={{ fontSize: 11, color: 'var(--tv-ink-subtle)' }}
                  >
                    HISTORIAL DEL PEDIDO ({data.events.length} EVENTOS)
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--tv-ink-muted)' }}>
                    {timelineOpen ? '▲' : '▼'}
                  </span>
                </button>

                {timelineOpen && (
                  <div
                    style={{
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    {data.events.map((ev, i) => {
                      const label = EVENT_LABELS[ev.eventType] || ev.eventType
                      return (
                        <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 99,
                              background: 'var(--tv-brand)',
                              marginTop: 5,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--tv-ink)' }}>{label}</div>
                            <div
                              style={{ fontSize: 11, color: 'var(--tv-ink-subtle)', marginTop: 2 }}
                            >
                              {fmtDate(ev.createdAt)} · {ev.actorRole || 'sistema'}
                            </div>

                            {ev.proofUrls && ev.proofUrls.length > 0 && (
                              <div
                                style={{
                                  marginTop: 8,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 8,
                                }}
                              >
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
          </>
        )}
      </div>
    </DashboardShell>
  )
}
