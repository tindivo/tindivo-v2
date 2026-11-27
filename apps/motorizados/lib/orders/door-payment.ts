import type { OrderDetailResponse } from '@/lib/types'

/**
 * Qué hace el motorizado con el dinero cuando llega a la puerta.
 *
 * - `prepaid`: el pedido ya viene pagado.
 * - `confirmed_by_business`: pago único (Yape/Plin) cuyo ingreso el negocio ya
 *   confirmó; no se cobra nada. Solo el negocio lo confirma, con o sin captura.
 * - `collect`: se cobra en la puerta, como siempre.
 *
 * `proof` es lo que se sabe de la captura que mandó el cliente. El motorizado
 * la VE y nunca la aprueba: no cambia el modo.
 */
export type DoorPayment = {
  mode: 'prepaid' | 'confirmed_by_business' | 'collect'
  proof: 'none' | 'pending' | 'rejected' | 'verified'
}

type DoorPaymentInput = Pick<
  OrderDetailResponse['order'],
  'paymentIntent' | 'paymentVerifiedAt' | 'hasPaymentProof' | 'paymentProofStatus'
>

function proofOf(order: Partial<DoorPaymentInput>): DoorPayment['proof'] {
  if (!order.hasPaymentProof) return 'none'
  if (order.paymentProofStatus === 'rejected') return 'rejected'
  if (order.paymentProofStatus === 'verified') return 'verified'
  // `pending` y cualquier valor que este front no conozca: la captura existe y
  // el negocio aún no ha dicho nada.
  return 'pending'
}

export function doorPayment(
  order: Partial<DoorPaymentInput> & { paymentIntent: string },
): DoorPayment {
  const proof = proofOf(order)
  if (order.paymentIntent === 'prepaid') return { mode: 'prepaid', proof }
  // `payment_verified_at` solo lo escribe el servidor en el pago único
  // (`confirm_delivery_payment`): en `pending_cash` o `pending_mixed` NO cambia
  // lo que hay que cobrar.
  if (order.paymentIntent === 'pending_yape' && order.paymentVerifiedAt) {
    return { mode: 'confirmed_by_business', proof }
  }
  return { mode: 'collect', proof }
}

/** Lo que entró de verdad cuando el negocio ya confirmó el ingreso: Yape/Plin. */
export function paymentRealForConfirmed(): 'paid_yape' {
  return 'paid_yape'
}

/**
 * La carrera del último metro: el detalle que tenía la hoja era `collect`, pero
 * el negocio pudo confirmar el ingreso mientras el motorizado caminaba.
 *
 * - Relectura fallida (`null`): se queda lo viejo; nunca se bloquea la entrega.
 * - Relectura que dice `confirmed_by_business`: gana.
 * - Relectura que sigue en `collect`: se toma, trae la captura al día.
 * - Cualquier otra (p. ej. `prepaid`, imposible desde un `collect`): lo viejo.
 */
export function recheckDoorPayment(stale: DoorPayment, fresh: DoorPayment | null): DoorPayment {
  if (!fresh) return stale
  if (fresh.mode === 'confirmed_by_business') return fresh
  // Lo confirmado no retrocede: una lectura que llega con «cobra» después de
  // haber visto la confirmación es vieja, no un cambio de idea del negocio.
  if (fresh.mode === 'collect') return mergeDoor(stale, fresh)
  return stale
}

/**
 * El cobro que queda cuando llega un detalle nuevo (props o relectura).
 * `confirmed_by_business` no vuelve a `collect`: el servidor no deshace una
 * confirmación (`confirm_delivery_payment` es idempotente y rechazar una captura
 * no la toca), así que un «cobra» posterior solo puede ser un dato viejo, y
 * creerlo es volver a cobrarle al cliente.
 */
export function mergeDoor(current: DoorPayment, incoming: DoorPayment): DoorPayment {
  if (current.mode === 'confirmed_by_business' && incoming.mode === 'collect') return current
  return incoming
}

/**
 * Relee el cobro con un tope: si la relectura falla o tarda más de `timeoutMs`,
 * se queda lo que había (`failed: true`) y la entrega nunca se bloquea. El
 * temporizador se limpia siempre que gana la relectura.
 */
export async function recheckWithTimeout(
  stale: DoorPayment,
  fetchFresh: () => Promise<DoorPayment>,
  timeoutMs: number,
): Promise<{ door: DoorPayment; failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const fresh = (async () => fetchFresh())().then(
    (d) => d,
    () => null,
  )
  try {
    const result = await Promise.race([fresh, timeout])
    if (!result) return { door: stale, failed: true }
    return { door: recheckDoorPayment(stale, result), failed: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Qué hacer al pulsar «Confirmar entrega» con lo último que se sabe del cobro.
 * Si la hoja mostraba «cobra» y el negocio acaba de confirmar, NO se envía: la
 * hoja pasa a «No cobres nada» y pide otro toque, para que el motorizado no
 * cobre de nuevo algo que ya entró.
 */
export function submitDecision(
  shown: DoorPayment,
  latest: DoorPayment,
  check: { failed: boolean; alreadyWarned: boolean } = { failed: false, alreadyWarned: false },
):
  | 'submit_prepaid'
  | 'submit_confirmed'
  | 'switch_to_confirmed'
  | 'hold_for_warning'
  | 'submit_as_chosen' {
  if (shown.mode === 'collect' && latest.mode === 'confirmed_by_business') {
    return 'switch_to_confirmed'
  }
  // La comprobación de este toque falló y el motorizado aún no vio el aviso: no
  // se envía todavía, para que lo lea antes de cobrar. El toque siguiente envía
  // (la entrega nunca se bloquea por esto).
  if (shown.mode === 'collect' && check.failed && !check.alreadyWarned) return 'hold_for_warning'
  if (shown.mode === 'confirmed_by_business') return 'submit_confirmed'
  if (shown.mode === 'prepaid') return 'submit_prepaid'
  return 'submit_as_chosen'
}
