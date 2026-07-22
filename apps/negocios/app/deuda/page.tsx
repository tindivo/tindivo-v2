'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="document"
        className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-2xl border border-tv-border max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-tv-ink flex items-center gap-2">
              <span>↩️</span> Detalle de Devolución
            </h3>
            {charge.shortId && (
              <p className="text-[12px] text-tv-ink-muted">
                Pedido <span className="tv-mono font-bold">#{charge.shortId}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] text-tv-ink-subtle hover:text-tv-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-[13px]">
          <div className="rounded-xl bg-tv-surface p-3 border border-tv-border">
            <p className="text-[11px] font-semibold text-tv-ink-muted uppercase">Concepto:</p>
            <p className="font-semibold text-tv-ink mt-0.5">{charge.description || 'Cargo por devolución al cliente'}</p>
            <p className="tv-mono font-bold text-tv-danger text-[16px] mt-1">{soles(charge.amount)}</p>
          </div>

          {r && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-tv-ink-muted uppercase">Razón del reclamo / apelación:</p>
                <p className="font-medium text-tv-ink mt-0.5">{r.reason || r.type}</p>
              </div>

              {r.resolutionNotes && (
                <div>
                  <p className="text-[11px] font-semibold text-tv-ink-muted uppercase">Resolución de administración:</p>
                  <p className="text-tv-ink-muted bg-amber-50 border border-amber-200 p-2.5 rounded-lg mt-0.5">
                    {r.resolutionNotes}
                  </p>
                </div>
              )}

              {r.evidenceUrls && r.evidenceUrls.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-tv-ink-muted uppercase mb-1.5">
                    Evidencias / Comprobantes adjuntos ({r.evidenceUrls.length}):
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {r.evidenceUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative overflow-hidden rounded-xl border border-tv-border bg-tv-surface"
                      >
                        <img
                          src={url}
                          alt={`Evidencia ${i + 1}`}
                          className="h-28 w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Ver original ↗
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 border-t pt-3 flex justify-end">
          <button type="button" className="tv-btn tv-btn-secondary tv-btn-sm" onClick={onClose}>
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
  const [typeFilter, setTypeFilter] = useState<'all' | 'commission' | 'delivery_fee' | 'refund_charge'>('all')
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

  const balance = data?.balanceDue ?? 0
  const pct = Math.min(balance / BLOCK_THRESHOLD, 1) * 100
  const whatsappNumber = data?.supportPhone ? data.supportPhone.replace(/\D/g, '') : ''
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola Tindivo, quiero coordinar el pago de mi deuda.')}`
    : '#'

  const filteredCharges = (data?.pendingCharges || []).filter((c) => {
    if (typeFilter === 'all') return true
    return c.chargeType === typeFilter
  })

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
        <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-red-100 p-3.5 text-[14px] font-semibold text-red-700">
          <MS name="block" size={20} filled className="shrink-0" />
          Tu cuenta está suspendida por deuda acumula. Coordina tu pago para reactivar el servicio.
        </div>
      )}

      {error && <p className="mb-4 text-[14px] text-tv-danger">{error}</p>}

      {loading || !data ? (
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-2xl bg-tv-surface" />
          <div className="h-28 animate-pulse rounded-2xl bg-tv-surface" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero de Deuda Acumulada */}
          <div className="rounded-[22px] bg-gradient-to-br from-[#1A1614] to-[#2A2422] p-5 text-white shadow-lg lg:p-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">
              DEBES AHORA
            </p>
            <p className="tv-mono my-2 text-[42px] font-bold leading-none lg:text-[52px]">
              {soles(balance)}
            </p>

            {/* Barra de límite de suspensión */}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] text-white/70">
                <span>0</span>
                <span>Suspensión a {soles(BLOCK_THRESHOLD)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/12">
                <div
                  className={`h-full transition-all duration-500 ${
                    pct >= 80 ? 'bg-tv-danger' : 'bg-tv-brand'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Desglose Transparente por Tipo de Cargo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-tv-border bg-white p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-tv-ink-muted text-[12px] font-semibold">
                <span className="text-[16px]">📦</span> Comisiones Tindivo
              </div>
              <p className="tv-mono font-bold text-tv-ink text-[22px] mt-2">
                {soles(data.summary.totalCommissions)}
              </p>
            </div>

            <div className="rounded-2xl border border-tv-border bg-white p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-tv-ink-muted text-[12px] font-semibold">
                <span className="text-[16px]">🛵</span> Delivery Fees
              </div>
              <p className="tv-mono font-bold text-tv-ink text-[22px] mt-2">
                {soles(data.summary.totalDeliveryFees)}
              </p>
            </div>

            <div className="rounded-2xl border border-tv-border bg-white p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-tv-ink-muted text-[12px] font-semibold">
                <span className="text-[16px]">↩️</span> Devoluciones
              </div>
              <p className="tv-mono font-bold text-tv-danger text-[22px] mt-2">
                {soles(data.summary.totalRefunds)}
              </p>
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

          {/* Sección Cargos Pendientes */}
          <div className="rounded-2xl border border-tv-border bg-white p-5 shadow-2xs">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
              <div>
                <h3 className="text-[16px] font-bold text-tv-ink">Cargos pendientes</h3>
                <p className="text-[12px] text-tv-ink-muted">
                  Detalle itemizado de cobros acumulados ({data.pendingCharges.length} cargos)
                </p>
              </div>

              {/* Filtro por Tipo */}
              <div className="flex flex-wrap gap-1 rounded-xl bg-tv-surface p-1 text-[12px]">
                {(
                  [
                    { key: 'all', label: 'Todos' },
                    { key: 'commission', label: 'Comisiones' },
                    { key: 'delivery_fee', label: 'Delivery' },
                    { key: 'refund_charge', label: 'Devoluciones' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setTypeFilter(f.key)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                      typeFilter === f.key
                        ? 'bg-white text-tv-ink shadow-2xs'
                        : 'text-tv-ink-muted hover:text-tv-ink'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCharges.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-tv-ink-subtle">
                No hay cargos pendientes en este filtro.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredCharges.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-2 rounded-xl border border-tv-border/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs hover:bg-tv-surface/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-[18px]">
                        {c.chargeType === 'commission'
                          ? '📦'
                          : c.chargeType === 'delivery_fee'
                            ? '🛵'
                            : '↩️'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-tv-ink text-[13px]">
                            {c.chargeType === 'commission'
                              ? 'Comisión Tindivo'
                              : c.chargeType === 'delivery_fee'
                                ? 'Delivery Fee'
                                : 'Devolución al Cliente'}
                          </span>
                          {c.shortId && (
                            <span className="tv-mono text-[12px] font-bold text-tv-brand">
                              #{c.shortId}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-tv-ink-muted mt-0.5">{c.description}</p>
                        <p className="text-[11px] text-tv-ink-subtle mt-0.5">{fmtDate(c.createdAt)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {c.chargeType === 'refund_charge' && (
                        <button
                          type="button"
                          onClick={() => setSelectedRefund(c)}
                          className="rounded-lg bg-tv-surface px-2.5 py-1 text-[11px] font-semibold text-tv-ink hover:bg-tv-ink/10 transition-colors"
                        >
                          Ver detalle
                        </button>
                      )}
                      <span className="tv-mono font-bold text-[15px] text-tv-ink">
                        {soles(c.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historial de Pagos Realizados */}
          <div className="rounded-2xl border border-tv-border bg-white p-5 shadow-2xs">
            <h3 className="text-[16px] font-bold text-tv-ink mb-1">Historial de pagos</h3>
            <p className="text-[12px] text-tv-ink-muted mb-4">
              Pagos confirmados por administración ({data.paymentHistory.length} registrados)
            </p>

            {data.paymentHistory.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-tv-ink-subtle">
                Aún no hay pagos registrados en tu historial.
              </p>
            ) : (
              <div className="space-y-2">
                {data.paymentHistory.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 rounded-xl border border-tv-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-tv-surface px-2.5 py-0.5 text-[11px] font-bold uppercase text-tv-ink">
                          {p.paymentMethod}
                        </span>
                        <span className="text-[12px] text-tv-ink-muted">{fmtDate(p.paidAt)}</span>
                      </div>
                      <p className="text-[12px] text-tv-ink-subtle mt-1">
                        Saldó {p.settledChargeCount} cargos ({p.orderCount} pedidos)
                        {p.note && ` · ${p.note}`}
                      </p>
                    </div>

                    <span className="tv-mono font-bold text-[16px] text-tv-success">
                      {soles(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Detalle de Devolución */}
      {selectedRefund && (
        <RefundDetailModal
          charge={selectedRefund}
          onClose={() => setSelectedRefund(null)}
        />
      )}
    </DashboardShell>
  )
}
