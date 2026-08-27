import type { Tracking } from '@/features/tracking/types'

/**
 * De quién es el turno con el dinero.
 *
 * POR QUÉ NO SIRVEN LOS PASOS QUE YA HAY.
 *   `TrackingSteps` proyecta el ciclo del PEDIDO, y lo hace con
 *   `STATUS_TO_TRACKING`, que colapsa `validando`, `pending_acceptance`,
 *   `awaiting_payment` y `confirmed` en un solo «Recibido»
 *   (`packages/contracts/src/order-status.ts`). Esa proyección es correcta para
 *   lo que responde —¿por dónde va mi comida?— pero dentro de ese único paso
 *   caben las tres esperas del prepago, y el cliente que las atraviesa está
 *   haciéndose otra pregunta: **¿me toca a mí ahora, o estoy esperando a
 *   alguien?**
 *
 *   Esa es la pregunta que hoy no tiene respuesta en pantalla, y es exactamente
 *   donde el cliente se pierde: elige prepago, ve «Pedido recibido» y se queda
 *   esperando un botón de pagar que no va a aparecer hasta que el negocio
 *   confirme. Los dos rieles conviven porque responden cosas distintas.
 *
 * NO NECESITA DATOS NUEVOS. Sale de lo que `get_tracking` ya publica.
 */
export type PrepayStage = 1 | 2 | 3 | 'done'

/**
 * La etapa del prepago, o `null` si no hay riel que pintar.
 *
 * `null` en tres familias de casos, y cada una por su motivo:
 *
 *   · **No es prepago.** No hay tres turnos que repartir.
 *   · **`cancelled`.** La pantalla de cancelado —y la de apelación de
 *     `proof_rejected_final`— cuentan otra historia, y un riel encima diciendo
 *     «vas por el paso 3» contradice al titular que tiene debajo.
 *   · **De `preparing` en adelante.** El dinero ya está resuelto y el riel no
 *     aporta: a partir de ahí manda `TrackingSteps`, que sí sigue avanzando.
 *     `confirmed` sí devuelve `'done'` a propósito: es el instante en que el
 *     pago queda verificado y es justo cuando cerrar el bucle vale algo.
 */
export function prepayStage(data: Tracking): PrepayStage | null {
  if (data.paymentIntent !== 'prepaid') return null

  switch (data.status) {
    case 'pending_acceptance':
      return 1
    case 'validando':
      // El mismo estado significa dos cosas distintas según haya captura o no:
      // sin ella el cliente todavía no ha pagado (es la espera de
      // disponibilidad), con ella la cajera está revisando. Es la misma
      // bifurcación que hacen `activeDeadline` y `TrackingPrepay`.
      return data.proofUrl ? 3 : 1
    case 'awaiting_payment':
      return 2
    case 'confirmed':
      return 'done'
    default:
      return null
  }
}
