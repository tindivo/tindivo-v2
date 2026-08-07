import type { Tone } from '@/lib/labels'
import { ORDER_STATUS, TIMELINE_EVENT_LABEL } from '@/lib/labels'

export interface TimelineEntry {
  kind: 'status' | 'event'
  at: string
  code: string
  actorRole: string | null
  data: Record<string, unknown> | null
  note: string | null
  elapsedSec: number | null
}

export interface OrderCharge {
  charge_type: string
  amount: number
  status: string
  description: string | null
  created_at: string
  settled_at: string | null
}

export interface OrderDetailItem {
  item_name_snapshot: string
  quantity: number
  unit_price: number
  line_total: number
  note: string | null
  customer_order_item_modifiers: {
    group_name_snapshot: string
    option_name_snapshot: string
    additional_price_snapshot: number
  }[]
}

export interface OrderStrike {
  reason: string
  created_at: string
  delivery_reference: string | null
}

/** Fila completa de `orders` más los joins que trae el endpoint. */
export interface OrderDetailRow {
  [key: string]: unknown
  id: string
  short_id: string
  order_number: number
  status: string
  businesses: { name: string; accent_color: string | null } | null
  drivers: { full_name: string | null; phone: string | null } | null
}

export interface OrderDetailResponse {
  order: OrderDetailRow
  /** Quién verificó el comprobante de prepago, ya resuelto por el endpoint. */
  verifiedBy: { full_name: string | null; email: string } | null
  items: OrderDetailItem[]
  charges: OrderCharge[]
  strikes: OrderStrike[]
  timeline: TimelineEntry[]
}

/**
 * Etiqueta y tono de una entrada de la línea de tiempo.
 *
 * Un código sin etiqueta se pinta crudo en vez de esconderse: si mañana
 * aparece un evento nuevo, prefiero que Yolvi vea `order.lo_que_sea` a las
 * 22:40 y no un hueco en el hilo.
 */
export function entryLabel(e: TimelineEntry): { label: string; tone: Tone } {
  if (e.kind === 'status') {
    const s = ORDER_STATUS[e.code]
    return { label: s?.label ?? e.code, tone: s?.tone ?? 'neutral' }
  }
  return { label: TIMELINE_EVENT_LABEL[e.code] ?? e.code, tone: 'brand' }
}

/** Estado del comprobante de prepago. `payment_proof_status` es `text` en la
 *  base, no un enum: los tres valores salen de `validate_order` (verified,
 *  rejected) y de la subida del cliente (pending). */
export const PROOF_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Sin revisar', tone: 'warning' },
  verified: { label: 'Verificado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
}
