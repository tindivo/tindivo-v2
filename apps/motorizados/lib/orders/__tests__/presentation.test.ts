import { describe, expect, it } from 'vitest'
import { MOMENTS, momentOf, moneyLine, orderStateBadge } from '../presentation'

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
