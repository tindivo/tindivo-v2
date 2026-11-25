import { describe, expect, it } from 'vitest'
import { cents, nominalDeliveryFeeCents } from './delivery-fee'

describe('cents', () => {
  it('pasa soles a céntimos enteros sin error de coma flotante', () => {
    expect(cents(48)).toBe(4800)
    expect(cents(0.1 + 0.2)).toBe(30)
    expect(cents(47.99)).toBe(4799)
  })
})

describe('nominalDeliveryFeeCents', () => {
  const bands = { near: 2, far: 2.5 }

  it('usa la tarifa de la banda', () => {
    expect(nominalDeliveryFeeCents('near', bands, 3)).toBe(200)
    expect(nominalDeliveryFeeCents('far', bands, 3)).toBe(250)
  })

  it('sin tarifa en la banda usa la del negocio', () => {
    expect(nominalDeliveryFeeCents('far', { near: 2 }, '3.50')).toBe(350)
    expect(nominalDeliveryFeeCents('near', null, 3)).toBe(300)
  })

  it('sin banda ni tarifa del negocio cae a S/ 2.00', () => {
    expect(nominalDeliveryFeeCents('near', {}, null)).toBe(200)
    expect(nominalDeliveryFeeCents('far', undefined, null)).toBe(200)
  })

  it('una tarifa de banda en null o vacía cuenta como ausente (como en SQL), no como cero', () => {
    expect(nominalDeliveryFeeCents('near', { near: null }, 3)).toBe(300)
    expect(nominalDeliveryFeeCents('near', { near: '' }, 3)).toBe(300)
    expect(nominalDeliveryFeeCents('near', { near: 0 }, 3)).toBe(0)
  })

  it('una tarifa de banda no numérica se ignora', () => {
    expect(nominalDeliveryFeeCents('near', { near: 'x' }, 4)).toBe(400)
  })
})
