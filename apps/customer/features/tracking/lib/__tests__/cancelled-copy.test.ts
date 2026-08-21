import { describe, expect, it } from 'vitest'
import { cancelledCopy } from '../format'

/**
 * Qué se le dice al cliente SOBRE SU DINERO cuando su pedido se cancela.
 *
 * La frase «no se te cobró nada» solo puede salir si de verdad no salió dinero.
 * Quien decide lo contrario en la base es el trigger de devolución de la `0124`,
 * y su criterio es `payment_proof_status = 'verified'` — NO la existencia de una
 * captura. Mientras el único camino al pago verificado fue subir una foto, mirar
 * la captura daba el mismo resultado y nadie notó la diferencia.
 *
 * La `0181` abrió el segundo camino: la cajera confirma el pago contra su propia
 * cuenta de Yape/Plin y el pedido queda verificado SIN comprobante. Ahí las dos
 * lecturas dejan de coincidir, y la que miraba la captura producía la peor
 * contradicción posible del piloto: Tindivo cargándole la devolución al
 * restaurante mientras a quien puso el dinero le dice que no pagó.
 *
 * Este fichero es el que faltaba cuando ese bug entró: la suite estaba verde
 * porque nadie cubría el prepago pagado sin captura.
 */

const PREPAGO = 'prepaid'

describe('cancelledCopy · qué se dice sobre el dinero', () => {
  describe('prepago confirmado en directo (0181): pagó, y NO hay captura', () => {
    const pagoDirecto = {
      paymentIntent: PREPAGO,
      proofUrl: null,
      paymentVerifiedAt: '2026-08-20T22:00:00Z',
    }

    it('el negocio cancela: no niega el cobro y manda a coordinarlo', () => {
      const c = cancelledCopy('business_cancelled', pagoDirecto)
      expect(c.body).not.toContain('No se te cobró nada')
      expect(c.body).toContain('ya habías enviado tu pago')
    })

    it('Tindivo cancela: mismo criterio', () => {
      const c = cancelledCopy('admin_cancelled', pagoDirecto)
      expect(c.body).not.toContain('No se te cobró nada')
      expect(c.body).toContain('ya habías enviado tu pago')
    })
  })

  describe('prepago con captura subida: el camino de siempre, sin cambios', () => {
    const conCaptura = { paymentIntent: PREPAGO, proofUrl: 'uid/order/attempt-1.jpg' }

    it('sigue reconociendo el pago', () => {
      expect(cancelledCopy('business_cancelled', conCaptura).body).toContain(
        'ya habías enviado tu pago',
      )
    })
  })

  describe('prepago que nunca llegó a pagarse', () => {
    const sinPagar = { paymentIntent: PREPAGO, proofUrl: null, paymentVerifiedAt: null }

    it('sí puede decir que no se le cobró: no hubo pago ni verificación', () => {
      expect(cancelledCopy('business_cancelled', sinPagar).body).toContain('No se te cobró nada')
    })

    it('el vencimiento del plazo de pago no habla de dinero enviado', () => {
      expect(cancelledCopy('prepay_timeout', sinPagar).title).toBe('Se acabó el tiempo para pagar')
    })
  })

  describe('contraentrega: el dinero nunca salió antes de la entrega', () => {
    it('no se le atribuye ningún pago aunque haya verificación', () => {
      const c = cancelledCopy('business_cancelled', {
        paymentIntent: 'pending_cash',
        paymentVerifiedAt: '2026-08-20T22:00:00Z',
      })
      expect(c.body).toContain('No se te cobró nada')
    })
  })
})
