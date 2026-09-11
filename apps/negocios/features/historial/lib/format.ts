import type { HistRow } from '@/lib/order-history/types'
import { mapPayment, mapPaymentReal } from '@/lib/orders/view-model'
import type { HistDisplay } from '../types'

const limaTimeFmt = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

const limaDateFmt = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Lima',
})

export function fmtTime(iso: string | null, isSingleDayToday = true): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const time = limaTimeFmt.format(t)
  if (isSingleDayToday) return time
  const date = limaDateFmt.format(t)
  return `${date} ${time}`
}

export function toDisplay(r: HistRow, isSingleDayToday = true): HistDisplay {
  const src = r.source === 'business_manual' ? 'manual' : ('web' as const)
  return {
    id: r.id,
    shortId: r.short_id,
    status: r.status,
    source: src,
    customer: r.customer_name ?? 'Cliente',
    total: Number(r.order_amount ?? 0) + Number(r.delivery_fee ?? 0),
    // LO REAL MANDA, y la intención es el respaldo. En un pedido todavía
    // abierto `payment_real` es NULL y no hay nada que preferir; en uno cerrado
    // es el único dato que corresponde a dinero que existió.
    payment: mapPaymentReal(r.payment_real) ?? mapPayment(r.payment_intent),
    closedAt: fmtTime(r.delivered_at ?? r.cancelled_at ?? r.created_at, isSingleDayToday),
    cancelReason: r.status === 'cancelled' ? (r.cancel_note ?? null) : null,
    isCancel: r.status === 'cancelled',
  }
}
