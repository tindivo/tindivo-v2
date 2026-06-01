import { toTrackingStep } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { InvalidStateTransitionError, OrderNotCancellableError } from '../../shared/errors'
import { assertCustomerCanCancel, assertTransition, isTerminal } from '../state-machine'
import { applyDelivered, applyPickedUp } from '../transitions'

describe('máquina de estados del pedido', () => {
  it('permite transiciones válidas del flujo canónico', () => {
    expect(() => assertTransition('pending_acceptance', 'confirmed')).not.toThrow()
    expect(() => assertTransition('confirmed', 'preparing')).not.toThrow()
    expect(() => assertTransition('picked_up', 'delivered')).not.toThrow()
  })

  it('rechaza transiciones inválidas', () => {
    expect(() => assertTransition('pending_acceptance', 'delivered')).toThrow(
      InvalidStateTransitionError,
    )
    expect(() => assertTransition('delivered', 'preparing')).toThrow(InvalidStateTransitionError)
  })

  it('cualquier estado no terminal puede cancelarse', () => {
    expect(() => assertTransition('preparing', 'cancelled')).not.toThrow()
    expect(() => assertTransition('heading_to_restaurant', 'cancelled')).not.toThrow()
  })

  it('delivered y cancelled son terminales', () => {
    expect(isTerminal('delivered')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('preparing')).toBe(false)
  })

  it('proyecta estados backend a los 5 pasos del cliente', () => {
    expect(toTrackingStep('pending_acceptance')).toBe('sent')
    expect(toTrackingStep('preparing')).toBe('preparing')
    expect(toTrackingStep('heading_to_restaurant')).toBe('preparing')
    expect(toTrackingStep('picked_up')).toBe('ontheway')
    expect(toTrackingStep('delivered')).toBe('delivered')
  })
})

describe('ventana de cancelación del cliente', () => {
  const created = new Date('2026-05-29T20:00:00Z')

  it('permite cancelar antes de confirmar y dentro de 2 min', () => {
    const now = new Date(created.getTime() + 60_000)
    expect(() =>
      assertCustomerCanCancel({ status: 'pending_acceptance', createdAt: created }, now),
    ).not.toThrow()
  })

  it('bloquea tras 2 min aunque siga sin confirmar', () => {
    const now = new Date(created.getTime() + 3 * 60_000)
    expect(() =>
      assertCustomerCanCancel({ status: 'pending_acceptance', createdAt: created }, now),
    ).toThrow(OrderNotCancellableError)
  })

  it('bloquea si ya está confirmado', () => {
    const now = new Date(created.getTime() + 30_000)
    expect(() => assertCustomerCanCancel({ status: 'confirmed', createdAt: created }, now)).toThrow(
      OrderNotCancellableError,
    )
  })
})

describe('operaciones de transición del agregado', () => {
  it('applyPickedUp fija la banda', () => {
    expect(applyPickedUp({ status: 'waiting_at_restaurant' }, 'far')).toEqual({
      status: 'picked_up',
      band: 'far',
    })
  })

  it('applyDelivered hace snapshot de la comisión', () => {
    const result = applyDelivered(
      { status: 'picked_up', deliveryMethod: 'delivery', band: 'near' },
      { config: { pickup: 0.5, near: 3.0, far: 3.5 } },
    )
    expect(result).toEqual({ status: 'delivered', tindivoCommission: 3.0 })
  })
})
