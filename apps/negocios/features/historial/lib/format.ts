import { mapPayment } from '@/lib/orders/view-model'
import type { HistDisplay, HistRow } from '../types'

const limaFmt = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

export function fmtTime(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? limaFmt.format(t) : null
}

export function toDisplay(r: HistRow): HistDisplay {
  const src = r.source === 'business_manual' ? 'manual' : ('web' as const)
  return {
    id: r.id,
    shortId: r.short_id,
    status: r.status,
    source: src,
    customer: r.customer_name ?? 'Cliente',
    total: Number(r.order_amount ?? 0) + Number(r.delivery_fee ?? 0),
    payment: mapPayment(r.payment_intent),
    closedAt: fmtTime(r.delivered_at ?? r.cancelled_at),
    cancelReason: r.status === 'cancelled' ? (r.cancel_note ?? null) : null,
    isCancel: r.status === 'cancelled',
  }
}
