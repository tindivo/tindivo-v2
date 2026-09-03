import { describe, expect, it } from 'vitest'
import {
  deliveryPointQuality,
  MOMENTS,
  momentOf,
  moneyLine,
  orderStateBadge,
} from '../presentation'

describe('el vocabulario es UNO SOLO para tarjeta y detalle', () => {
  // ESTE ES EL DEFECTO QUE MOTIVO EL MODULO.
  //
  // `money-card` condicionaba el vuelto a `changeToGive != null`, y esa columna
  // llega SIEMPRE NULL en los pedidos manuales —el 100% del piloto— porque
  // `create_business_manual_order` lo calcula, lo devuelve y no lo escribe. El
  // bloque del vuelto no se pintaba nunca en la pantalla donde se cobra, y el
  // hero mostraba «vuelto S/ 0.00». La tarjeta ya lo derivaba bien.
  it('el vuelto se DERIVA aunque la columna venga NULL', () => {
    const m = moneyLine({
      paymentIntent: 'pending_cash',
      total: 45,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: 50,
      changeToGive: null, // lo que manda el canal manual
    })
    expect(m.detail).toBe('efectivo · vuelto S/ 5.00')
  })

  it('si la columna SI trae valor, manda ella', () => {
    const m = moneyLine({
      paymentIntent: 'pending_cash',
      total: 45,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: 50,
      changeToGive: 7,
    })
    expect(m.detail).toBe('efectivo · vuelto S/ 7.00')
  })

  it('el prepago pone una palabra donde va la cifra', () => {
    const m = moneyLine({
      paymentIntent: 'prepaid',
      total: 45,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: null,
      changeToGive: null,
    })
    expect(m).toEqual({ headline: 'Prepagado', detail: 'no cobrar', tone: 'success' })
  })

  it('el mixto encabeza con la parte en EFECTIVO', () => {
    const m = moneyLine({
      paymentIntent: 'pending_mixed',
      total: 45,
      cashAmount: 30,
      yapeAmount: 15,
      clientPaysWith: 50,
      changeToGive: null,
    })
    expect(m.headline).toBe('S/ 30.00')
    expect(m.detail).toBe('efectivo + S/ 15.00 Yape · vuelto S/ 20.00')
  })

  it('un metodo nulo no se hace pasar por efectivo', () => {
    const m = moneyLine({
      paymentIntent: null,
      total: 45,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: null,
      changeToGive: null,
    })
    expect(m.detail).toBe('método por confirmar')
  })

  // ENTREGADO: MANDA LO QUE PASÓ, NO LO QUE SE PLANEÓ.
  //
  // El historial describía `payment_intent` para siempre, así que un pedido
  // planeado en efectivo que el cliente acabo pagando por Yape seguía diciendo
  // "efectivo" en el resumen del turno — un cobro que el motorizado no hizo.
  describe('cuando ya se entregó', () => {
    const planeado = {
      paymentIntent: 'pending_cash',
      total: 52,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: 100,
      changeToGive: null,
    }

    it('el metodo real pisa al planeado', () => {
      expect(moneyLine({ ...planeado, paymentReal: 'paid_yape' })).toEqual({
        headline: 'S/ 52.00',
        detail: 'Yape/Plin',
        tone: 'neutral',
      })
    })

    it('un mixto real enseña SU division, no la que hubiera planeado la cajera', () => {
      // Planeado todo en efectivo; acabo siendo 20 + 32.
      const m = moneyLine({
        ...planeado,
        paymentReal: 'paid_mixed',
        cashAmount: 20,
        yapeAmount: 32,
      })
      expect(m.headline).toBe('S/ 20.00')
      expect(m.detail).toBe('efectivo + S/ 32.00 Yape')
    })

    it('no habla de vuelto: ahi ya se dio', () => {
      expect(moneyLine({ ...planeado, paymentReal: 'paid_cash' }).detail).toBe('efectivo')
    })

    it('un prepago entregado no se anuncia como cobro', () => {
      expect(moneyLine({ ...planeado, paymentReal: 'paid_prepaid' }).headline).toBe('Prepagado')
    })

    it('sin cobrar no se inventa uno', () => {
      expect(moneyLine({ ...planeado, paymentReal: 'unpaid' }).detail).toBe('sin cobrar')
    })

    it('sin `paymentReal` sigue describiendo el plan', () => {
      // Es lo que ven las bandejas antes de entregar.
      expect(moneyLine(planeado).detail).toBe('efectivo · vuelto S/ 48.00')
    })
  })

  it('ya cobrado: no se habla de vuelto', () => {
    const m = moneyLine({
      paymentIntent: 'pending_cash',
      total: 45,
      cashAmount: null,
      yapeAmount: null,
      clientPaysWith: 50,
      changeToGive: null,
      settled: true,
    })
    expect(m.detail).toBe('efectivo')
  })
})

describe('el estado del pedido', () => {
  it('primera persona por defecto, tercera para pedidos ajenos', () => {
    expect(orderStateBadge('heading_to_restaurant')?.text).toBe('Voy al local')
    expect(orderStateBadge('heading_to_restaurant', true)?.text).toBe('Va al local')
  })

  it('un status desconocido no inventa insignia', () => {
    expect(orderStateBadge('validando')).toBeNull()
  })

  // El color del estado NUNCA es el de la alarma: ambar y rojo son el idioma
  // del reloj, y un estado es un hecho, no una urgencia.
  it('ningun estado usa un tono de alarma', () => {
    const estados = [
      'preparing',
      'waiting_driver',
      'heading_to_restaurant',
      'waiting_at_restaurant',
      'picked_up',
      'delivered',
    ]
    for (const s of estados) {
      expect(['warning', 'danger'], s).not.toContain(orderStateBadge(s)?.tone)
      expect(['warning', 'danger'], `${s} (ajeno)`).not.toContain(orderStateBadge(s, true)?.tone)
    }
  })
})

describe('el paso del recorrido', () => {
  // Salia de un `moment={0|1|2}` escrito a mano en page.tsx: un numero magico
  // que no miraba la maquina de estados y que nunca llegaba a 3, asi que el
  // cuarto paso jamas se marcaba como actual.
  it('sale del status y cubre los CUATRO pasos', () => {
    expect(momentOf('heading_to_restaurant')).toBe(0)
    expect(momentOf('waiting_at_restaurant')).toBe(1)
    expect(momentOf('picked_up')).toBe(2)
    expect(momentOf('delivered')).toBe(3)
    expect(MOMENTS).toHaveLength(4)
  })

  it('un pedido sin dueno no esta en el recorrido', () => {
    expect(momentOf('preparing')).toBeNull()
    expect(momentOf('waiting_driver')).toBeNull()
  })

  it('cada paso tiene su etiqueta', () => {
    for (const status of [
      'heading_to_restaurant',
      'waiting_at_restaurant',
      'picked_up',
      'delivered',
    ]) {
      const i = momentOf(status)
      expect(i).not.toBeNull()
      expect(MOMENTS[i as number]).toBeTruthy()
    }
  })
})

describe('deliveryPointQuality (0207)', () => {
  it('un GPS bueno se anuncia con su medida y sin advertencia', () => {
    expect(deliveryPointQuality('2026-09-03T10:00:00Z', 8)).toEqual({
      tone: 'success',
      label: 'GPS ±8 m',
      hint: null,
    })
  })

  it('un GPS flojo avisa de que puede estar a una cuadra', () => {
    const q = deliveryPointQuality('2026-09-03T10:00:00Z', 60)
    expect(q.tone).toBe('warning')
    expect(q.label).toBe('GPS aproximado · ±60 m')
    expect(q.hint).toMatch(/cuadra/)
  })

  it('a mano es un punto BUENO sin medida, no un punto dudoso', () => {
    // La diferencia importa: lo eligió una persona mirando el mapa. No hay
    // metros porque no hubo sensor, no porque el punto sea malo.
    expect(deliveryPointQuality('2026-09-03T10:00:00Z', null)).toEqual({
      tone: 'neutral',
      label: 'Punto marcado a mano',
      hint: null,
    })
  })

  it('sin sello manda a la referencia: ese pin no lo eligió nadie', () => {
    // Las cinco direcciones que apuntan al centro del pueblo.
    const q = deliveryPointQuality(null, null)
    expect(q.tone).toBe('warning')
    expect(q.hint).toMatch(/referencia/)
  })

  it('sin sello no se cree una medida que venga suelta', () => {
    expect(deliveryPointQuality(null, 8).label).toBe('Sin punto confirmado')
  })
})
