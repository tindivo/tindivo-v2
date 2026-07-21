/**
 * Determina si un pedido cancelado por proof_rejected_final causa bloqueo.
 *
 * Reglas:
 * - Dentro de ventana de 24h sin apelación → bloqueado
 * - Apelación pending o in_review → bloqueado
 * - Apelación approved + refund pending → bloqueado
 * - Apelación approved + refund completed → NO bloqueado
 * - Apelación rejected → NO bloqueado
 * - Fuera de ventana de 24h sin apelación → NO bloqueado
 */

export interface CancelledOrder {
  id: string
  short_id: string
  cancelled_at: string | null
}

export interface AppealData {
  appeal_status: string | null
  refund_status: string | null
}

export interface BlockCheckResult {
  blocked: boolean
  blockedOrderShortId: string | null
}

export function isOrderBlocking(
  order: CancelledOrder,
  appeal: AppealData | null,
  now: Date,
): boolean {
  if (!order.cancelled_at) return false

  const deadline = new Date(order.cancelled_at)
  deadline.setHours(deadline.getHours() + 24)
  const withinWindow = now < deadline

  // Dentro de ventana y no ha apelado → bloqueado
  if (withinWindow && !appeal) return true

  // No hay apelación y ya pasó la ventana → libre
  if (!appeal) return false

  // Apelación pendiente o en revisión → bloqueado
  if (
    appeal.appeal_status === 'pending' ||
    appeal.appeal_status === 'in_review'
  )
    return true

  // Aprobada pero devolución no completada → bloqueado
  if (
    appeal.appeal_status === 'approved' &&
    appeal.refund_status === 'pending'
  )
    return true

  // Aprobada con devolución completada → libre
  // Rechazada → libre
  return false
}

/**
 * Itera sobre pedidos cancelados y retorna el primer bloqueo encontrado.
 * `getAppeal` permite al hook inyectar los datos de apelación precargados.
 */
export function checkPaymentBlock(
  orders: CancelledOrder[],
  getAppeal: (orderId: string) => AppealData | null,
  now: Date = new Date(),
): BlockCheckResult {
  for (const order of orders) {
    if (isOrderBlocking(order, getAppeal(order.id), now)) {
      return { blocked: true, blockedOrderShortId: order.short_id }
    }
  }
  return { blocked: false, blockedOrderShortId: null }
}
