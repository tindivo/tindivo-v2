import type { DeliveryMethod } from '@tindivo/contracts'

/** Lo que le falta al cliente para poder llegar al checkout. */
export type GateType = 'auth' | 'phone' | 'address' | 'pending_payment_resolution'

export interface GateInputs {
  isAuthenticated: boolean
  phoneVerified: boolean
  /** Hay al menos una dirección con calle, referencia y pin DENTRO del polígono. */
  hasValidAddress: boolean
  /** Hay una captura rechazada sin resolver (`payment-block.ts`). */
  isPaymentBlocked: boolean
  /** Cómo quiere recibir ESTE pedido. Vive en la bolsa, no en el perfil. */
  deliveryMethod: DeliveryMethod
}

/**
 * Qué le falta a este cliente, en el orden en que se le va a pedir.
 *
 * POR QUÉ ES UNA FUNCIÓN PURA Y NO SIGUE DENTRO DEL HOOK. Vivía mezclada con
 * cuatro consultas a Supabase dentro de `useOrderReadiness`, así que la única
 * forma de probar la regla era montar el hook y simular la red. La regla que
 * estrena esta versión —el recojo no pide domicilio— es exactamente la clase de
 * cosa que hay que poder probar de los dos lados sin levantar nada.
 *
 * EL DOMICILIO DEPENDE DEL MÉTODO, Y ES EL ARREGLO. Antes se exigía SIEMPRE, sin
 * mirar cómo quería recibir el cliente. Consecuencia medida en `tindivo-prod` el
 * 2026-09-08: de 50 cuentas con celular verificado, 14 no tenían dirección y
 * NINGUNA de las 14 llegó a pedir jamás. El mapa era el final del embudo para el
 * 28% de quien ya había pagado el OTP.
 *
 * Dentro de esas 14 hay dos personas distintas, y la segunda ni siquiera podía
 * intentarlo: `canSaveAddress` (`lib/address-validation.ts`) exige que el pin
 * caiga DENTRO del polígono de reparto, así que quien vive en un caserío de las
 * afueras no puede guardar su casa aunque quiera —el botón nunca se habilita— y
 * el recojo, que es el único canal que físicamente le sirve, le estaba cerrado
 * por una condición que no le aplica.
 *
 * LO QUE NO SE RELAJA, Y POR QUÉ. El celular se pide igual en recojo: el strike
 * del `pickup_no_show` (`0220`) se ancla SOLO por teléfono —en un pedido de
 * mostrador no hay `delivery_reference` ni coordenadas— y la cajera necesita un
 * número al que llamar. Y el bloqueo por captura rechazada tampoco cede: es una
 * deuda con el negocio, y cambiar de canal no puede ser la vía de escape.
 */
export function missingGates(i: GateInputs): GateType[] {
  // Sin sesión no se ha leído el perfil, así que no hay nada más que se pueda
  // afirmar. Devolver aquí evita anunciar «te falta el celular» sobre un dato
  // que nadie consultó.
  if (!i.isAuthenticated) return ['auth']

  const gates: GateType[] = []

  if (!i.phoneVerified) gates.push('phone')

  // LA LÍNEA DEL ARREGLO. Un recojo no tiene domicilio que pedir.
  if (i.deliveryMethod === 'delivery' && !i.hasValidAddress) gates.push('address')

  if (i.isPaymentBlocked) gates.push('pending_payment_resolution')

  return gates
}
