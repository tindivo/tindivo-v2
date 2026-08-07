import type { BoardOrder } from './types'

export type Urgency = 'overdue' | 'ready' | 'normal'

/** Urgencia visual del pedido en bandeja (HU-D-011/013). */
export function orderUrgency(
  o: Pick<BoardOrder, 'urgent_since' | 'estimated_ready_at' | 'status'>,
  now: number,
): Urgency {
  if (o.urgent_since || (o.estimated_ready_at && Date.parse(o.estimated_ready_at) < now)) {
    return 'overdue'
  }
  if (o.status === 'waiting_driver') return 'ready'
  return 'normal'
}

export const URGENCY_CARD: Record<Urgency, string> = {
  overdue: 'border border-danger/20 bg-danger-soft',
  ready: 'border border-warning/25 bg-warning-soft',
  normal: 'border border-ink/[0.04] bg-white',
}
