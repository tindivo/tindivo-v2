'use client'

import { Card } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import { EVENT_LABELS, REJECTION_LABELS } from '../lib/constants'
import { fmtDate } from '../lib/format'
import type { RefundDetail } from '../types'
import { ProofThumbnail } from './proof-thumbnail'

export function RefundDetailView({ data }: { data: RefundDetail }) {
  const [timelineOpen, setTimelineOpen] = useState(true)
  const order = data.order

  const rejectionText =
    order?.rejectionReasonCode && REJECTION_LABELS[order.rejectionReasonCode]
      ? REJECTION_LABELS[order.rejectionReasonCode]
      : order?.rejectionReasonText || 'Comprobante no válido'

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      {/* Header */}
      <Card className="flex items-center justify-between p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">↩️</span>
            <span className="text-lg font-bold text-ink">Devolución al Cliente</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
              Devuelto
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">{data.chargeDescription}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Monto debitado
          </div>
          <div className="font-mono text-[22px] font-bold text-danger">
            {soles(data.chargeAmount)}
          </div>
        </div>
      </Card>

      {/* Contexto */}
      <Card className="p-5">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
          Contexto del caso
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <div className="text-[11px] uppercase text-ink-subtle">Pedido</div>
            <div className="font-mono text-sm font-bold text-brand">#{order?.shortId || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-ink-subtle">Monto del pedido</div>
            <div className="font-mono text-sm font-bold text-ink">
              {order?.orderAmount ? soles(order.orderAmount) : soles(data.chargeAmount)}
            </div>
          </div>
          {order?.customerName && (
            <div>
              <div className="text-[11px] uppercase text-ink-subtle">Cliente</div>
              <div className="text-sm font-semibold text-ink">{order.customerName}</div>
            </div>
          )}
          {order?.createdAt && (
            <div>
              <div className="text-[11px] uppercase text-ink-subtle">Creado</div>
              <div className="text-[13px] text-ink-muted">{fmtDate(order.createdAt)}</div>
            </div>
          )}
          {data.createdAt && (
            <div>
              <div className="text-[11px] uppercase text-ink-subtle">Apelación</div>
              <div className="text-[13px] text-ink-muted">{fmtDate(data.createdAt)}</div>
            </div>
          )}
        </div>
      </Card>

      {/* Conflicto */}
      <Card className="border-danger/10 bg-danger-soft p-5">
        <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-danger">
          El conflicto
        </div>

        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase text-danger">
            Motivo de rechazo del restaurante
          </div>
          <div className="mt-0.5 text-sm font-semibold text-danger">{rejectionText}</div>
        </div>

        {data.reason && (
          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase text-danger">
              Argumento del cliente al apelar
            </div>
            <div className="mt-0.5 text-[13px] italic text-ink-muted">
              &ldquo;{data.reason}&rdquo;
            </div>
          </div>
        )}

        {data.disputeProofUrl && (
          <div className="mt-2">
            <div className="mb-1.5 text-[11px] font-bold uppercase text-danger">
              Comprobante en disputa
            </div>
            <ProofThumbnail url={data.disputeProofUrl} label="Comprobante subido por el cliente" />
          </div>
        )}
      </Card>

      {/* Devolución */}
      <Card className="border-success/10 bg-success-soft/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-success">
            ✓ Devolución completada
          </div>
          <div className="font-mono text-lg font-bold text-danger">
            Se devolvió {soles(data.refundAmount)}
          </div>
        </div>

        {data.refundProofUrl && (
          <div className="mt-2">
            <div className="mb-1.5 text-[11px] font-bold uppercase text-success">
              Captura del Yape / Plin
            </div>
            <ProofThumbnail url={data.refundProofUrl} label="Comprobante de devolución del Admin" />
          </div>
        )}

        {data.resolutionNotes && (
          <div className="mt-3 border-t border-success/10 pt-3">
            <div className="text-[11px] font-bold uppercase text-success">Nota de resolución</div>
            <div className="mt-0.5 text-[13px] font-medium text-ink">{data.resolutionNotes}</div>
          </div>
        )}
      </Card>

      {/* Timeline */}
      {data.events && data.events.length > 0 && (
        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex w-full items-center justify-between border-b border-border bg-surface p-4 text-left"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Historial del pedido ({data.events.length} eventos)
            </span>
            <span className="text-sm text-ink-muted">{timelineOpen ? '▲' : '▼'}</span>
          </button>

          {timelineOpen && (
            <div className="flex flex-col gap-3.5 p-4">
              {data.events.map((ev, i) => {
                const label = EVENT_LABELS[ev.eventType] || ev.eventType
                return (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink">{label}</div>
                      <div className="text-[11px] text-ink-subtle">
                        {fmtDate(ev.createdAt)} · {ev.actorRole || 'sistema'}
                      </div>
                      {ev.proofUrls && ev.proofUrls.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2">
                          {ev.proofUrls.map((p, pIdx) => (
                            <ProofThumbnail key={pIdx} url={p.url} label={p.label} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
