import { describe, expect, it } from 'vitest'
import type { Tracking } from '@/features/tracking/types'
import { prepayStage } from '../prepay-stage'

/**
 * El riel contesta «¿me toca a mí?», y equivocarse tiene un coste concreto:
 * decirle «pagas tú» a quien todavía está esperando que el negocio confirme lo
 * manda a buscar un botón que no existe, y decirle «esperando» a quien tiene
 * quince minutos corriendo le hace perder el pedido.
 *
 * Los estados son los de `ORDER_TRANSITIONS`; la bifurcación de `validando`
 * —el mismo estado significa dos cosas según haya captura— es la misma que
 * hacen `activeDeadline` y `TrackingPrepay`, y por eso se prueba aquí también.
 */

function pedido(p: Partial<Tracking>): Tracking {
  return { paymentIntent: 'prepaid', ...p } as Tracking
}

describe('prepayStage', () => {
  describe('los tres turnos', () => {
    it('pending_acceptance · espera al negocio', () => {
      expect(prepayStage(pedido({ status: 'pending_acceptance' }))).toBe(1)
    })

    it('awaiting_payment · le toca al cliente', () => {
      expect(prepayStage(pedido({ status: 'awaiting_payment' }))).toBe(2)
    })

    it('validando CON captura · le toca a la cajera', () => {
      expect(prepayStage(pedido({ status: 'validando', proofUrl: 'proofs/x.jpg' }))).toBe(3)
    })

    it('validando SIN captura · sigue siendo espera de disponibilidad', () => {
      // El cliente no ha pagado todavía: enseñarle «verificando» le diría que su
      // dinero ya salió cuando ni siquiera ha abierto el Yape.
      expect(prepayStage(pedido({ status: 'validando' }))).toBe(1)
      expect(prepayStage(pedido({ status: 'validando', proofUrl: null }))).toBe(1)
    })

    it('confirmed · cierra el bucle', () => {
      // Es el instante en que el pago queda verificado, y es justo cuando
      // enseñar los tres pasos completos vale para algo.
      expect(prepayStage(pedido({ status: 'confirmed' }))).toBe('done')
    })
  })

  describe('no hay riel que pintar', () => {
    it.each(['pending_cash', 'pending_yape'])('contraentrega (%s) en ningún estado', (intent) => {
      for (const status of ['pending_acceptance', 'validando', 'confirmed', 'preparing']) {
        expect(prepayStage(pedido({ paymentIntent: intent, status }))).toBeNull()
      }
    })

    it.each([
      'preparing',
      'waiting_driver',
      'heading_to_restaurant',
      'picked_up',
      'delivered',
    ])('%s · el dinero ya está resuelto y manda TrackingSteps', (status) => {
      expect(prepayStage(pedido({ status }))).toBeNull()
    })

    it('cancelled · la pantalla de cancelado cuenta otra historia', () => {
      // Incluida la de apelación (`proof_rejected_final`), que se pinta sobre el
      // mismo estado: un riel diciendo «vas por el paso 3» contradiría al
      // titular que tiene justo debajo.
      expect(prepayStage(pedido({ status: 'cancelled' }))).toBeNull()
      expect(
        prepayStage(pedido({ status: 'cancelled', cancelReason: 'proof_rejected_final' })),
      ).toBeNull()
    })
  })

  it('un pedido con la captura rechazada y reintento sigue siendo turno del cliente', () => {
    // `proof_attempt = 1` devuelve el pedido a `awaiting_payment`: la cajera ya
    // miró y rebotó la captura, así que la pelota vuelve a estar en el tejado
    // del cliente y el riel tiene que retroceder con ella.
    expect(prepayStage(pedido({ status: 'awaiting_payment', proofAttempt: 1 }))).toBe(2)
  })
})
