import { useSyncExternalStore } from 'react'
import { type OrderVM, withConfirmedPayment } from '@/lib/orders/view-model'

/**
 * Lo que respondió «Sí, me llegó» para cada pedido, mientras el tablero no lo
 * refleje. Vive fuera de la tarjeta: cerrar y reabrir el pedido, o pasar a otro
 * y volver, no lo borra (CAX-006). Dura lo que dura la pestaña.
 *
 * - `confirmed`: el servidor respondió verificado; manda aunque el tablero siga viejo.
 * - `uncertain`: no sabemos si se guardó; la tarjeta no da instrucción de cobro
 *   hasta que se vuelva a confirmar o el tablero traiga el pago confirmado. Vale
 *   solo para el intento de captura en que se pulsó: si el cliente manda otra
 *   captura, la tarjeta vuelve a ofrecer revisarla (y rechazarla).
 */
export type ConfirmationOutcome = 'confirmed' | 'uncertain'
export type RememberedConfirmation = { outcome: ConfirmationOutcome; attempt: number }

const outcomes = new Map<string, RememberedConfirmation>()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Una confirmación ya recibida no la rebaja una respuesta incierta posterior. */
export function rememberConfirmation(
  orderId: string,
  outcome: ConfirmationOutcome,
  attempt: number,
) {
  const prev = outcomes.get(orderId)
  if (prev?.outcome === 'confirmed') return
  if (prev?.outcome === outcome && prev.attempt === attempt) return
  outcomes.set(orderId, { outcome, attempt })
  emit()
}

/** El tablero ya trae el pago confirmado: la memoria sobra. */
export function forgetConfirmation(orderId: string) {
  if (outcomes.delete(orderId)) emit()
}

/**
 * Lo que vale para el intento de captura vigente: lo confirmado vale siempre;
 * lo incierto, solo en el intento en que se pulsó.
 */
export function effectiveOutcome(
  remembered: RememberedConfirmation | undefined,
  attempt: number,
): ConfirmationOutcome | undefined {
  if (!remembered) return undefined
  if (remembered.outcome === 'confirmed') return 'confirmed'
  return remembered.attempt === attempt ? 'uncertain' : undefined
}

export function confirmationOutcome(orderId: string): ConfirmationOutcome | undefined {
  return outcomes.get(orderId)?.outcome
}

export function useConfirmationOutcome(orderId: string): RememberedConfirmation | undefined {
  return useSyncExternalStore(
    subscribe,
    () => outcomes.get(orderId),
    () => undefined,
  )
}

/**
 * El pedido tal como debe leerlo todo el detalle (filas de total, comanda,
 * vista previa): cobrado si la respuesta del servidor ya confirmó el ingreso,
 * aunque el tablero siga viejo. La tarjeta del pago único recibe el pedido
 * crudo: es la que reconcilia y borra la memoria cuando el tablero se pone al día.
 */
export function useOrderWithConfirmation(order: OrderVM): OrderVM {
  const outcome = effectiveOutcome(useConfirmationOutcome(order.rowId), order.proofAttempt ?? 0)
  return withConfirmedPayment(order, outcome)
}

export function resetConfirmationMemoryForTests() {
  outcomes.clear()
  emit()
}
