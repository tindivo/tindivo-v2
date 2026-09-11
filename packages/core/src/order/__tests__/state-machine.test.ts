import { toTrackingStep } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { InvalidStateTransitionError, OrderNotCancellableError } from '../../shared/errors'
import { assertCustomerCanCancel, assertTransition, isTerminal } from '../state-machine'
import { applyPickedUp } from '../transitions'

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

  it('proyecta estados backend a los 4 pasos del cliente', () => {
    expect(toTrackingStep('validando')).toBe('received')
    expect(toTrackingStep('pending_acceptance')).toBe('received')
    expect(toTrackingStep('confirmed')).toBe('received')
    expect(toTrackingStep('preparing')).toBe('preparing')
    expect(toTrackingStep('heading_to_restaurant')).toBe('preparing')
    expect(toTrackingStep('picked_up')).toBe('ontheway')
    expect(toTrackingStep('delivered')).toBe('delivered')
  })
})

describe('recojo en el local (0219/0220)', () => {
  it('sale de cocina al mostrador y de ahí a entregado', () => {
    expect(() => assertTransition('preparing', 'ready_for_pickup')).not.toThrow()
    expect(() => assertTransition('ready_for_pickup', 'delivered')).not.toThrow()
  })

  it('una bolsa en el mostrador se puede cancelar: es el plantón', () => {
    expect(() => assertTransition('ready_for_pickup', 'cancelled')).not.toThrow()
  })

  /**
   * El estado nuevo NO abre ningún camino de vuelta hacia el flujo de reparto.
   * Si lo abriera, un recojo podría acabar en la cola de `apps/motorizados` por
   * la puerta de atrás — que es justo lo que la policy `ord_driver_read` y la
   * guarda de `take` cierran por delante.
   */
  it('no vuelve a cocina ni entra en el flujo de motorizado', () => {
    for (const destino of [
      'preparing',
      'waiting_driver',
      'heading_to_restaurant',
      'waiting_at_restaurant',
      'picked_up',
    ] as const) {
      expect(() => assertTransition('ready_for_pickup', destino)).toThrow(
        InvalidStateTransitionError,
      )
    }
  })

  /**
   * `delivered` SIGUE SIENDO EL ÚNICO TERMINAL, compartido con delivery, y de
   * eso depende la pieza de crecimiento entera: la cláusula (1) de
   * `customer_contraentrega_decision` pregunta por `status = 'delivered'` sin
   * mirar el método, así que un recojo completado habilita contraentrega para
   * el siguiente pedido a domicilio. Un terminal propio para el recojo habría
   * roto eso en silencio.
   */
  it('el mostrador no estrena terminal propio', () => {
    expect(isTerminal('ready_for_pickup')).toBe(false)
    expect(isTerminal('delivered')).toBe(true)
  })

  /**
   * El tercer paso del cliente es POSICIONAL —«salió de cocina, aún no lo
   * tiene»—, no «va en una moto». Las palabras las elige `stepsFor()` en la app
   * del cliente; aquí solo se fija el sitio.
   */
  it('el cliente lo ve en el tercer paso, no atascado en «preparando»', () => {
    expect(toTrackingStep('ready_for_pickup')).toBe('ontheway')
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

  // El snapshot de la comisión al entregar ya NO se prueba aquí: `applyDelivered`
  // se borró en la 0125. El cálculo corre en `advance_order` (Postgres) y lo
  // cubre A1.* en apps/api/lib/__tests__/delivery-charges.integration.test.ts.
})
