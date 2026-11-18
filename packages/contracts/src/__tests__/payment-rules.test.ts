import { describe, expect, it } from 'vitest'
import {
  customerPaymentIntents,
  isCustomerPaymentAllowed,
  pickupForcesPrepay,
} from '../payment-rules'
import { CreateOrderRequestSchema } from '../requests'

/**
 * EN EL MOSTRADOR NO SE FÍA. (0223)
 *
 * Estas aserciones son sobre la REGLA, no sobre la pantalla: qué combinaciones
 * de pago y método puede mandar el canal del cliente. El espejo en SQL
 * (`orders_pickup_payment_chk`) lo cubren los tests de integración, porque solo
 * ahí hay una base contra la que estrellarse.
 */
describe('0223 · qué puede pagar el cliente según cómo recibe', () => {
  describe('customerPaymentIntents', () => {
    it('en delivery no cambia nada: las tres siguen valiendo', () => {
      expect(customerPaymentIntents('delivery', null)).toEqual([
        'pending_cash',
        'pending_yape',
        'prepaid',
      ])
    })

    /**
     * LA ASERCIÓN QUE SOSTIENE LA REGLA. `pending_yape` significa que el
     * cliente le transfiere AL MOTORIZADO al recibir la bolsa; en un mostrador
     * no hay motorizado. Antes entraba por las cuatro capas y el sistema lo
     * reinterpretaba en silencio como «cobrar en caja».
     */
    it('en recojo no existe el Yape contraentrega, conteste lo que conteste', () => {
      for (const timing of ['now', 'later', null] as const) {
        expect(customerPaymentIntents('pickup', timing)).not.toContain('pending_yape')
      }
    })

    /**
     * 0283 (Jesús, 2026-10-29): en el canal del cliente un recojo solo se paga
     * por adelantado, «ahora» o «más tarde». Revierte la columna «ahora» de 0223.
     */
    it('un recojo, ahora o más tarde, solo admite prepago', () => {
      expect(customerPaymentIntents('pickup', 'later')).toEqual(['prepaid'])
      expect(customerPaymentIntents('pickup', 'now')).toEqual(['prepaid'])
    })

    it('sin contestar todavía, el recojo también es solo prepago', () => {
      expect(customerPaymentIntents('pickup', null)).toEqual(['prepaid'])
    })
  })

  describe('pickupForcesPrepay', () => {
    it('todo recojo obliga a prepagar por método; el delivery no', () => {
      expect(pickupForcesPrepay('pickup', 'later')).toBe(true)
      expect(pickupForcesPrepay('pickup', 'now')).toBe(true)
      expect(pickupForcesPrepay('pickup', null)).toBe(true)
      expect(pickupForcesPrepay('delivery', null)).toBe(false)
    })
  })

  describe('isCustomerPaymentAllowed', () => {
    it('acepta y rechaza las mismas combinaciones que la lista', () => {
      expect(isCustomerPaymentAllowed('pending_yape', 'delivery', null)).toBe(true)
      expect(isCustomerPaymentAllowed('pending_yape', 'pickup', 'now')).toBe(false)
      expect(isCustomerPaymentAllowed('pending_cash', 'pickup', 'now')).toBe(false)
      expect(isCustomerPaymentAllowed('pending_cash', 'pickup', 'later')).toBe(false)
      expect(isCustomerPaymentAllowed('prepaid', 'pickup', 'now')).toBe(true)
      expect(isCustomerPaymentAllowed('prepaid', 'pickup', 'later')).toBe(true)
    })

    /**
     * `pending_mixed` nunca fue del canal del cliente —lo corta
     * `create_customer_order` con su propio guard desde antes de todo esto— y
     * la lista no lo incluye en ningún caso. Se afirma para que un futuro
     * «añado mixto al recojo» tenga que pasar por aquí.
     */
    it('el pago mixto no entra por ningún método', () => {
      expect(isCustomerPaymentAllowed('pending_mixed', 'delivery', null)).toBe(false)
      expect(isCustomerPaymentAllowed('pending_mixed', 'pickup', 'now')).toBe(false)
    })
  })

  /**
   * EL CONTRATO ES LA CAPA QUE DA EL MENSAJE LEGIBLE. El CHECK de la 0223 es el
   * suelo por si alguien llega a la RPC sin pasar por aquí, pero un 23514 en
   * bruto no le dice nada al cliente: el 422 con texto sale de estos refines.
   */
  describe('CreateOrderRequestSchema', () => {
    const base = {
      businessId: '00000000-0000-4000-8000-000000000001',
      customerName: 'Vecino',
      customerPhone: '912345678',
      items: [{ menuItemId: '00000000-0000-4000-8000-000000000002', quantity: 1 }],
    }

    it('rechaza un recojo con Yape contraentrega', () => {
      const r = CreateOrderRequestSchema.safeParse({
        ...base,
        deliveryMethod: 'pickup',
        pickupTiming: 'now',
        paymentIntent: 'pending_yape',
      })
      expect(r.success).toBe(false)
      expect(r.error?.issues.some((i) => i.path.includes('paymentIntent'))).toBe(true)
    })

    it('rechaza un recojo «ahora» pagado en caja (0283)', () => {
      const r = CreateOrderRequestSchema.safeParse({
        ...base,
        deliveryMethod: 'pickup',
        pickupTiming: 'now',
        paymentIntent: 'pending_cash',
      })
      expect(r.success).toBe(false)
      const issues = r.error?.issues.filter((i) => i.path.includes('paymentIntent')) ?? []
      expect(issues.map((i) => i.message)).toEqual(['Un recojo se paga por adelantado'])
    })

    it('rechaza un recojo «más tarde» que no venga prepagado', () => {
      const r = CreateOrderRequestSchema.safeParse({
        ...base,
        deliveryMethod: 'pickup',
        pickupTiming: 'later',
        paymentIntent: 'pending_cash',
      })
      expect(r.success).toBe(false)
      expect(r.error?.issues.some((i) => i.path.includes('paymentIntent'))).toBe(true)
    })

    it('deja pasar los dos caminos que sí existen: prepago ahora o más tarde', () => {
      for (const [timing, intent] of [
        ['now', 'prepaid'],
        ['later', 'prepaid'],
      ] as const) {
        const r = CreateOrderRequestSchema.safeParse({
          ...base,
          deliveryMethod: 'pickup',
          pickupTiming: timing,
          paymentIntent: intent,
        })
        expect(r.success, `${timing} + ${intent} debería entrar`).toBe(true)
      }
    })

    /**
     * El orden de los refines importa y por eso se afirma: un recojo sin
     * contestar el timing tiene que enseñar la falta del TIMING, que es la que
     * la pantalla sabe llevar de la mano. La del pago cuelga de ella.
     */
    it('sin contestar cuándo recoge, la falta que sale es la del timing', () => {
      const r = CreateOrderRequestSchema.safeParse({
        ...base,
        deliveryMethod: 'pickup',
        paymentIntent: 'pending_cash',
      })
      expect(r.success).toBe(false)
      expect(r.error?.issues.some((i) => i.path.includes('pickupTiming'))).toBe(true)
    })

    it('el delivery no se toca: Yape al recibir sigue entrando', () => {
      const r = CreateOrderRequestSchema.safeParse({
        ...base,
        deliveryMethod: 'delivery',
        paymentIntent: 'pending_yape',
        deliveryAddress: 'Jr. Los Pinos 123',
        deliveryReference: 'Portón azul',
        coordinates: { lat: -8.9, lng: -78.3 },
      })
      expect(r.success).toBe(true)
    })
  })
})
