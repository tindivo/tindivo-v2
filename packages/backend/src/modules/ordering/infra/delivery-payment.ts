import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'

/**
 * El pago único del cliente de confianza (0296) habla con SQL por cuatro RPC; aquí solo se
 * traducen sus errores. La regla (dueño, estado, intentos, ruta, archivo) vive en SQL y no se
 * copia: `hint` es el contrato interno entre la función y la API (DB-16).
 */

const CONFLICT_HINTS = new Set([
  'order_not_pending_yape',
  'order_closed',
  'order_not_accepted',
  'payment_already_confirmed',
  'no_proof_to_reject',
  'proof_attempt_mismatch',
])
const VALIDATION_HINTS = new Set([
  'invalid_proof_path',
  'proof_file_missing',
  'invalid_reason_code',
])

interface RpcError {
  code?: string
  hint?: string | null
  message: string
}

/** Lo que dijo la RPC cuando se negó; `null` si el fallo no es de negocio. */
export function deliveryPaymentDomainError(error: RpcError): DomainError | null {
  if (error.code === 'P0002') return new DomainError('Pedido no encontrado', 'not_found')
  if (error.code !== 'P0001') return null
  const hint = error.hint ?? ''
  // Intentos agotados: lo mismo que responde el prepago (403).
  if (hint === 'proof_attempts_exhausted') return new DomainError(error.message, 'forbidden')
  if (CONFLICT_HINTS.has(hint)) return new DomainError(error.message, 'invalid_state_transition')
  if (VALIDATION_HINTS.has(hint)) return new DomainError(error.message, 'validation_error')
  return null
}

function unexpected(what: string, error: unknown): Error {
  // Sin el texto del proveedor: viaja como `cause` y el logger solo lo describe.
  return new Error(what, { cause: error })
}

/**
 * El intento que gastaría la próxima captura del pago único, o `null` si el pedido no es de
 * ese tipo (la API entonces deja hablar al prepago). El resto de negativas sí se lanzan.
 */
export async function deliveryProofNextAttempt(
  db: TypedSupabaseClient,
  orderId: string,
  customerUserId: string,
): Promise<number | null> {
  const { data, error } = await db.rpc('delivery_payment_proof_next_attempt', {
    p_order_id: orderId,
    p_customer_user_id: customerUserId,
  })
  if (error) {
    if (error.code === 'P0001' && error.hint === 'order_not_pending_yape') return null
    throw (
      deliveryPaymentDomainError(error) ??
      unexpected('No se pudo consultar el intento de la captura', error)
    )
  }
  if (typeof data !== 'number') {
    throw new Error('delivery_payment_proof_next_attempt no devolvió un intento')
  }
  return data
}

export interface RegisteredDeliveryProof {
  /** Verdadero si la misma ruta ya estaba registrada (respuesta perdida): no hay aviso que mandar. */
  replayed: boolean
}

/**
 * El cliente registra la captura del pago único. Devuelve `null` si el pedido no es de ese tipo
 * (la API entonces deja el error del prepago). NO cambia el estado del pedido.
 */
export async function registerDeliveryPaymentProof(
  db: TypedSupabaseClient,
  orderId: string,
  customerUserId: string,
  path: string,
): Promise<RegisteredDeliveryProof | null> {
  const { data, error } = await db.rpc('register_delivery_payment_proof', {
    p_order_id: orderId,
    p_customer_user_id: customerUserId,
    p_path: path,
  })
  if (error) {
    if (error.code === 'P0001' && error.hint === 'order_not_pending_yape') return null
    throw (
      deliveryPaymentDomainError(error) ??
      unexpected('No se pudo registrar la captura del pago', error)
    )
  }
  return { replayed: Boolean((data as { replayed?: boolean } | null)?.replayed) }
}

/** `timestamptz` de Postgres (con offset y fracciones) a UTC con `Z` (TS-11). */
export function toUtcIso(value: unknown): string {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error('La base devolvió una fecha que no se lee')
  return date.toISOString()
}

/** Estados en los que el negocio ya aceptó el pedido con entrega (donde el pago único admite captura). */
const ACCEPTED = [
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
]

function toCents(value: unknown): number {
  // `Number(null)` y `Number("")` dan 0: se rechazan antes de convertir.
  if (value === null || value === undefined || value === '') {
    throw new Error('Importe del pedido ilegible')
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('Importe del pedido ilegible')
  return Math.round(n * 100)
}

/** Total del prepago como "E.CC": se suma en céntimos enteros, nunca en coma flotante. */
export function prepayTotalText(orderAmount: unknown, deliveryFee: unknown): string {
  const cents = toCents(orderAmount) + toCents(deliveryFee)
  if (cents < 0) throw new Error('Importe del pedido ilegible')
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/**
 * Qué puede hacer el cliente con la captura. La regla del servidor, no la de la app: en el prepago
 * la captura es obligatoria y solo se sube esperando el pago; en el pago único del cliente de
 * confianza es opcional y se admite con el pedido aceptado, mientras el negocio no confirme el
 * ingreso. En los dos casos, dos intentos.
 */
export function prepayProofState(order: {
  status: string
  payment_intent: string
  delivery_method: string
  proof_attempt: number | null
  payment_proof_status: string | null
  payment_verified_at: string | null
}) {
  const attemptsLeft = (order.proof_attempt ?? 0) < 2
  const single = order.payment_intent === 'pending_yape' && order.delivery_method === 'delivery'
  const canUploadProof = single
    ? ACCEPTED.includes(order.status) && order.payment_verified_at === null && attemptsLeft
    : order.payment_intent === 'prepaid' && order.status === 'awaiting_payment' && attemptsLeft
  return {
    proofOptional: single,
    canUploadProof,
    paymentProofStatus: order.payment_proof_status ?? null,
    paymentVerifiedAt: order.payment_verified_at
      ? new Date(order.payment_verified_at).toISOString()
      : null,
  }
}
