import { describe, expect, it } from 'vitest'
import type { HistRow } from '@/lib/order-history/types'
import { mapPaymentReal } from '@/lib/orders/view-model'
import { toDisplay } from '../format'

/**
 * LA COLUMNA «PAGO» DEL HISTORIAL DICE LO QUE ENTRÓ, NO LO QUE SE PENSABA.
 *
 * `payment_intent` es lo que el CLIENTE eligió al pedir. `payment_real` es lo
 * que ENTRÓ, y difieren más de lo que parece: el motorizado pregunta al
 * entregar y la cajera pregunta en el mostrador precisamente porque en el
 * último metro la gente cambia de idea.
 *
 * El historial pintaba la intención y la llamaba «Pago». Con el recojo se
 * volvió indefendible: desde la `0224` la cajera DECLARA el cobro al aceptar, y
 * el historial le respondía «Efectivo» a cada recojo que ella acababa de cobrar
 * por Yape — contradiciéndola en la misma pantalla, y descuadrando el corte de
 * la noche contra un número que nadie escribió.
 */

const FILA = {
  id: 'o1',
  short_id: 'ABCD1234',
  status: 'delivered',
  source: 'customer_pwa',
  customer_name: 'Vecino',
  order_amount: 24,
  delivery_fee: 0,
  payment_intent: 'pending_cash',
  payment_real: null,
  delivered_at: '2026-09-08T20:00:00Z',
  cancelled_at: null,
  created_at: '2026-09-08T19:30:00Z',
  cancel_note: null,
} as unknown as HistRow

describe('0224 · el historial muestra el cobro real', () => {
  it('un recojo cobrado por Yape ya no aparece como efectivo', () => {
    const fila = { ...FILA, payment_intent: 'pending_cash', payment_real: 'paid_yape' }

    expect(toDisplay(fila).payment).toBe('pending_wallet')
  })

  /**
   * El caso simétrico, y el que de verdad se veía en el piloto de delivery: el
   * cliente elige Yape al pedir y acaba pagando en efectivo al motorizado.
   */
  it('y un pedido que se pensó por Yape y se pagó en efectivo, tampoco al revés', () => {
    const fila = { ...FILA, payment_intent: 'pending_yape', payment_real: 'paid_cash' }

    expect(toDisplay(fila).payment).toBe('pending_cash')
  })

  /**
   * MIENTRAS EL PEDIDO SIGUE ABIERTO NO HAY NADA QUE PREFERIR. `payment_real`
   * se escribe al cerrar (o, en un recojo «ahora», al aceptar), así que antes
   * de eso lo único que existe es la intención — y es la buena.
   */
  it('sin cobro declarado todavía, manda la intención', () => {
    expect(toDisplay({ ...FILA, payment_real: null }).payment).toBe('pending_cash')
  })

  describe('mapPaymentReal', () => {
    it('traduce las cuatro formas de cobro que existen', () => {
      expect(mapPaymentReal('paid_cash')).toBe('pending_cash')
      expect(mapPaymentReal('paid_yape')).toBe('pending_wallet')
      expect(mapPaymentReal('paid_mixed')).toBe('pending_mixed')
      expect(mapPaymentReal('paid_prepaid')).toBe('prepaid')
    })

    /**
     * `unpaid` y `refunded` NO son formas de pago: no tienen fila en
     * `PAYMENT_META`, y elegirles cualquiera de las cuatro sería inventarle al
     * negocio un cobro que no ocurrió. Caen en la intención, que es exactamente
     * lo que el historial mostraba antes de esto.
     */
    it('lo que no es una forma de pago devuelve null, no una elegida al azar', () => {
      expect(mapPaymentReal('unpaid')).toBeNull()
      expect(mapPaymentReal('refunded')).toBeNull()
      expect(mapPaymentReal(null)).toBeNull()
    })
  })
})
