import { toCourierTrackingStep } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { InvalidStateTransitionError } from '../../shared/errors'
import {
  assertCourierTransition,
  assertCustomerCanCancelCourier,
  isCourierTerminal,
} from '../state-machine'

describe('máquina de estados de Tindivo Entregas (courier_orders)', () => {
  it('permite el flujo canónico completo', () => {
    expect(() => assertCourierTransition('requested', 'accepted')).not.toThrow()
    expect(() => assertCourierTransition('accepted', 'heading_to_pickup')).not.toThrow()
    expect(() => assertCourierTransition('heading_to_pickup', 'at_pickup')).not.toThrow()
    expect(() => assertCourierTransition('at_pickup', 'picked_up')).not.toThrow()
    expect(() => assertCourierTransition('picked_up', 'heading_to_dropoff')).not.toThrow()
    expect(() => assertCourierTransition('heading_to_dropoff', 'delivered')).not.toThrow()
  })

  it('rechaza saltarse pasos', () => {
    expect(() => assertCourierTransition('requested', 'picked_up')).toThrow(
      InvalidStateTransitionError,
    )
    expect(() => assertCourierTransition('accepted', 'delivered')).toThrow(
      InvalidStateTransitionError,
    )
  })

  it('cualquier estado no terminal puede cancelarse', () => {
    expect(() => assertCourierTransition('requested', 'cancelled')).not.toThrow()
    expect(() => assertCourierTransition('accepted', 'cancelled')).not.toThrow()
    expect(() => assertCourierTransition('heading_to_pickup', 'cancelled')).not.toThrow()
    expect(() => assertCourierTransition('at_pickup', 'cancelled')).not.toThrow()
    expect(() => assertCourierTransition('picked_up', 'cancelled')).not.toThrow()
    expect(() => assertCourierTransition('heading_to_dropoff', 'cancelled')).not.toThrow()
  })

  it('delivered y cancelled son terminales; nada más lo es', () => {
    expect(isCourierTerminal('delivered')).toBe(true)
    expect(isCourierTerminal('cancelled')).toBe(true)
    for (const s of [
      'requested',
      'accepted',
      'heading_to_pickup',
      'at_pickup',
      'picked_up',
      'heading_to_dropoff',
    ] as const) {
      expect(isCourierTerminal(s)).toBe(false)
    }
  })

  it('delivered es terminal de verdad: nada transiciona hacia ni desde él salvo heading_to_dropoff', () => {
    for (const from of [
      'requested',
      'accepted',
      'heading_to_pickup',
      'at_pickup',
      'picked_up',
      'delivered',
      'cancelled',
    ] as const) {
      expect(() => assertCourierTransition(from, 'delivered')).toThrow(InvalidStateTransitionError)
    }
  })

  it('soltar (release) vuelve a requested desde los tres pasos aceptados', () => {
    expect(() => assertCourierTransition('accepted', 'requested')).not.toThrow()
    expect(() => assertCourierTransition('heading_to_pickup', 'requested')).not.toThrow()
    expect(() => assertCourierTransition('at_pickup', 'requested')).not.toThrow()
  })

  it('no se puede soltar después de recoger: el artículo ya no está en A', () => {
    expect(() => assertCourierTransition('picked_up', 'requested')).toThrow(
      InvalidStateTransitionError,
    )
    expect(() => assertCourierTransition('heading_to_dropoff', 'requested')).toThrow(
      InvalidStateTransitionError,
    )
  })

  it('proyecta al stepper de 5 pasos que ve el cliente', () => {
    expect(toCourierTrackingStep('requested')).toBe('requested')
    expect(toCourierTrackingStep('accepted')).toBe('confirmed')
    expect(toCourierTrackingStep('heading_to_pickup')).toBe('confirmed')
    expect(toCourierTrackingStep('at_pickup')).toBe('confirmed')
    expect(toCourierTrackingStep('picked_up')).toBe('picked_up')
    expect(toCourierTrackingStep('heading_to_dropoff')).toBe('on_the_way')
    expect(toCourierTrackingStep('delivered')).toBe('delivered')
    expect(toCourierTrackingStep('cancelled')).toBe('cancelled')
  })
})

describe('cancelación del cliente', () => {
  it('permite cancelar en cualquier estado no terminal', () => {
    expect(() => assertCustomerCanCancelCourier({ status: 'requested' })).not.toThrow()
    expect(() => assertCustomerCanCancelCourier({ status: 'heading_to_dropoff' })).not.toThrow()
  })

  it('bloquea si ya es terminal', () => {
    expect(() => assertCustomerCanCancelCourier({ status: 'delivered' })).toThrow(
      InvalidStateTransitionError,
    )
    expect(() => assertCustomerCanCancelCourier({ status: 'cancelled' })).toThrow(
      InvalidStateTransitionError,
    )
  })
})
