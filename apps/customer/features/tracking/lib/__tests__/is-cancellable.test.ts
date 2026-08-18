import { describe, expect, it } from 'vitest'
import type { Tracking } from '@/features/tracking/types'
import { isCancellable } from '../format'

/**
 * `isCancellable` decide si se pinta el botón de cancelar, y **tiene que decir
 * exactamente lo mismo que `cancel_customer_order`** en la base. Las dos reglas
 * viven separadas por fuerza (una es SQL y la otra TypeScript), así que lo único
 * que las mantiene alineadas es esta tabla.
 *
 * Si el front ofrece MÁS de lo que la RPC permite, el cliente pulsa y se come un
 * error. Si ofrece MENOS, hay gente atrapada en un pedido que sí podía cancelar
 * sin que nada se lo diga — que es el caso que trajo `0169`: el prepago estaba
 * bloqueado incluso antes de que el negocio aceptara, cuando todavía no había
 * dinero de por medio.
 *
 * La regla, tal como la aplica la RPC:
 *
 *   |                     | efectivo | prepago |
 *   |---------------------|----------|---------|
 *   | pending_acceptance  |    sí    |   sí    |
 *   | awaiting_payment    |    —     |   no    |
 *   | validando           |    sí    |   no    |
 *   | preparing y más allá|    no    |   no    |
 */

const MIO = 'order-uuid'

function pedido(status: string, paymentIntent: string): Tracking {
  return { status, paymentIntent } as Tracking
}

describe('isCancellable', () => {
  describe('efectivo', () => {
    it('cancela mientras el negocio no acepta', () => {
      expect(isCancellable(pedido('pending_acceptance', 'pending_cash'), MIO)).toBe(true)
    })

    it('cancela también en validando: ahí no hay dinero enviado', () => {
      expect(isCancellable(pedido('validando', 'pending_cash'), MIO)).toBe(true)
    })

    it('no cancela una vez en cocina', () => {
      expect(isCancellable(pedido('preparing', 'pending_cash'), MIO)).toBe(false)
      expect(isCancellable(pedido('confirmed', 'pending_cash'), MIO)).toBe(false)
    })
  })

  describe('prepago', () => {
    it('cancela antes de que el negocio acepte, que es cuando aún no ha pagado', () => {
      // El caso que `0169` desbloqueó. Un prepago nace en `pending_acceptance`
      // igual que uno en efectivo: el negocio todavía está confirmando que tiene
      // lo pedido y el cliente no ha abierto su billetera.
      expect(isCancellable(pedido('pending_acceptance', 'prepaid'), MIO)).toBe(true)
    })

    it('NO cancela en awaiting_payment: el Yape pudo salir ya', () => {
      // No vale mirar si subió el comprobante — puede haber pagado y no haber
      // subido la foto todavía. El dinero salió aunque la app no lo sepa.
      expect(isCancellable(pedido('awaiting_payment', 'prepaid'), MIO)).toBe(false)
    })

    it('NO cancela en validando, aunque el efectivo sí pueda', () => {
      // La asimetría es deliberada: en prepago ese estado significa que hay una
      // captura subida, y la devolución la resuelve soporte.
      expect(isCancellable(pedido('validando', 'prepaid'), MIO)).toBe(false)
      expect(isCancellable(pedido('validando', 'pending_cash'), MIO)).toBe(true)
    })
  })

  describe('propiedad', () => {
    it('sin pedido propio no se ofrece cancelar, ni siquiera en el estado bueno', () => {
      // `ownedId` sale de que RLS devuelva la fila. Un enlace de seguimiento
      // compartido por WhatsApp lo abre cualquiera; solo su dueño lo cancela.
      expect(isCancellable(pedido('pending_acceptance', 'pending_cash'), null)).toBe(false)
      expect(isCancellable(pedido('pending_acceptance', 'prepaid'), null)).toBe(false)
    })
  })
})
