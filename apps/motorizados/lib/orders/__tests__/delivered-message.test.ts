import { describe, expect, it } from 'vitest'
import { deliveredMessage } from '../delivered-message'

const order = {
  shortId: 'K7M2QX4B',
  paymentIntent: 'pending_cash',
  orderAmount: 30,
  deliveryFee: 5,
  cashAmount: null,
}

describe('deliveredMessage', () => {
  it('en efectivo dice cuánto te llevas', () => {
    const msg = deliveredMessage(order, { paymentReal: 'paid_cash' })
    expect(msg).toContain('#K7M2QX4B')
    expect(msg).toContain('Cobraste')
    expect(msg).toContain('35')
  })

  it('en mixto cuenta solo la parte en efectivo', () => {
    const msg = deliveredMessage(order, { paymentReal: 'paid_mixed', cashAmount: 12 })
    expect(msg).toContain('12')
    expect(msg).not.toContain('35')
  })

  it('por Yape o prepagado no hay efectivo que rendir', () => {
    expect(deliveredMessage(order, { paymentReal: 'paid_yape' })).toBe(
      'Pedido #K7M2QX4B entregado con éxito',
    )
    expect(deliveredMessage(order, { paymentReal: 'paid_prepaid' })).toBe(
      'Pedido #K7M2QX4B entregado con éxito',
    )
  })

  it('sin método declarado se parte de lo planeado', () => {
    expect(deliveredMessage({ ...order, paymentIntent: 'paid_cash' }, {})).toContain('Cobraste')
    expect(deliveredMessage(order, {})).toBe('Pedido #K7M2QX4B entregado con éxito')
  })
})
