/** Reglas de cobro del motorizado, compartidas por la bandeja y el detalle. */

/**
 * Vuelto que el motorizado tiene que llevar encima.
 *
 * POR QUÉ SE DERIVA Y NO SE LEE.
 * `orders.change_to_give` existe pero en los pedidos MANUALES llega siempre
 * NULL: `create_business_manual_order` calcula el vuelto, lo devuelve en su
 * respuesta JSON y NUNCA lo escribe en la columna. Como hoy el 100% de los
 * pedidos del piloto son manuales, leer la columna a secas equivale a no
 * enseñar el vuelto jamás — que es lo que pasaba en la tarjeta del board.
 *
 * Derivarlo aquí es exacto: los tres sumandos viajan en el payload.
 * `changeToGive` sigue mandando cuando SÍ trae valor, para no pisar el dato
 * autoritativo el día que el RPC empiece a persistirlo.
 *
 * Vive en un módulo aparte porque la bandeja y el detalle nombran sus campos
 * distinto (snake_case vs camelCase) y ya se demostró que duplicar la regla
 * termina en dos pantallas contradiciéndose.
 *
 * PENDIENTE: el arreglo de fondo es que `create_business_manual_order` escriba
 * `change_to_give`. Requiere migración.
 */
export function changeDue(input: {
  paymentIntent: string | null
  /** Total a cobrar (comida + envío). */
  total: number
  /** Parte en efectivo de un pago mixto. */
  cashAmount: number | null
  /** Billete con el que paga el cliente. */
  clientPaysWith: number | null
  /** Valor persistido, si alguna vez lo hay. */
  changeToGive: number | null
}): number | null {
  if (input.changeToGive != null && input.changeToGive > 0) return input.changeToGive

  const cashPart =
    input.paymentIntent === 'pending_cash'
      ? input.total
      : input.paymentIntent === 'pending_mixed'
        ? (input.cashAmount ?? 0)
        : 0

  if (input.clientPaysWith == null || cashPart <= 0) return null
  const change = Math.round((input.clientPaysWith - cashPart) * 100) / 100
  return change > 0 ? change : null
}
