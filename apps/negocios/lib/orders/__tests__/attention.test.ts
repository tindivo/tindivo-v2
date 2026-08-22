import { ORDER_STATUSES, type OrderStatus } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { attentionState } from '../attention'
import { DEFAULT_ORDER_TIMERS, type OrderRow, toOrderVM } from '../view-model'

const NOW = Date.parse('2026-08-21T19:40:00Z')

function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord_1',
    short_id: 'JMAXL98Z',
    status: 'pending_acceptance',
    source: 'customer_pwa',
    customer_name: 'Juan Perez',
    customer_phone: '999888777',
    delivery_address: 'Av. San Martin 123',
    delivery_reference: 'Puerta verde',
    delivery_method: 'delivery',
    order_amount: 25,
    delivery_fee: 5,
    payment_intent: 'pending_cash',
    payment_proof_status: null,
    comprobante_prepago_url: null,
    proof_attempt: 0,
    prep_time_minutes: 15,
    estimated_ready_at: null,
    prep_extension_count: 0,
    ready_early_used: false,
    ready_early_at: null,
    client_pays_with: null,
    change_to_give: null,
    yape_amount: null,
    cash_amount: null,
    requires_validation: false,
    validation_reason_code: null,
    risk_flags: {},
    driver_id: null,
    created_at: '2026-08-21T19:38:08Z',
    pending_acceptance_at: '2026-08-21T19:38:08Z',
    awaiting_payment_at: null,
    validating_at: null,
    waiting_driver_at: null,
    picked_up_at: null,
    delivered_at: null,
    cancelled_at: null,
    cancel_note: null,
    cancel_reason: null,
    driver: null,
    ...overrides,
  }
}

const vm = (o: Partial<OrderRow> = {}) => toOrderVM(row(o), NOW, DEFAULT_ORDER_TIMERS)

describe('attentionState · el invariante "si suena, se ve"', () => {
  /**
   * EL TEST QUE JUSTIFICA EL MÓDULO.
   *
   * `JMAXL98Z` se perdió porque el sonido y lo visible salían de sitios
   * distintos: sonaba en todas las rutas durante cinco minutos y la tarjeta solo
   * existía en `/`. Esto recorre los ONCE estados del enum y exige que las dos
   * salidas —la que enciende la alarma y la que pinta— coincidan siempre.
   *
   * Va sobre `ORDER_STATUSES` y no sobre una lista a mano para que el día que el
   * enum crezca, el estado nuevo entre aquí solo y haya que decidir de qué lado
   * cae.
   */
  it('para TODO estado del enum, hasPending ⟺ hay banner', () => {
    for (const status of ORDER_STATUSES satisfies readonly OrderStatus[]) {
      const state = attentionState([vm({ status })])
      expect(state.hasPending, `estado ${status}`).toBe(state.banner !== null)
      expect(state.pendingCount, `estado ${status}`).toBe(state.orders.length)
    }
  })

  it('sin pedidos no hay alarma ni banner', () => {
    const state = attentionState([])
    expect(state.hasPending).toBe(false)
    expect(state.pendingCount).toBe(0)
    expect(state.banner).toBeNull()
  })
})

describe('attentionState · qué reclama a la cajera', () => {
  it('reclama en pending_acceptance y en validando', () => {
    expect(attentionState([vm({ status: 'pending_acceptance' })]).hasPending).toBe(true)
    expect(
      attentionState([vm({ status: 'validando', validating_at: '2026-08-21T19:38:08Z' })])
        .hasPending,
    ).toBe(true)
  })

  it('NO reclama en awaiting_payment: la pelota la tiene el cliente', () => {
    // El pedido sí es "nuevo" para `getColumn` —y su tarjeta se ve— pero la
    // cajera no tiene nada que hacer hasta que llegue la captura. Despertarla
    // aquí sería alarma sin acción posible.
    const state = attentionState([vm({ status: 'awaiting_payment' })])
    expect(state.hasPending).toBe(false)
    expect(state.banner).toBeNull()
  })

  it('ignora los que ya están en cocina, en reparto o cerrados', () => {
    const state = attentionState([
      vm({ status: 'preparing' }),
      vm({ status: 'picked_up' }),
      vm({ status: 'delivered' }),
      vm({ status: 'cancelled' }),
    ])
    expect(state.hasPending).toBe(false)
  })
})

describe('attentionState · el banner', () => {
  it('apunta al MÁS urgente, no al más antiguo', () => {
    // El viejo tiene 10 min de ventana (prepago en validación); el reciente,
    // 5 (aceptación). Al que hay que atender primero es al segundo, aunque
    // llegara después.
    const viejo = vm({
      id: 'ord_viejo',
      short_id: 'VIEJO111',
      status: 'validando',
      payment_intent: 'prepaid',
      validating_at: '2026-08-21T19:35:00Z',
    })
    const urgente = vm({
      id: 'ord_urgente',
      short_id: 'URGE2222',
      status: 'pending_acceptance',
      pending_acceptance_at: '2026-08-21T19:38:08Z',
    })
    expect(viejo.countdownSec).toBeGreaterThan(urgente.countdownSec)

    const banner = attentionState([viejo, urgente]).banner
    expect(banner?.target.id).toBe('URGE2222')
    expect(banner?.countdownSec).toBe(urgente.countdownSec)
  })

  it('con uno solo nombra el pedido; con varios, cuenta', () => {
    expect(attentionState([vm({ short_id: 'JMAXL98Z' })]).banner?.label).toBe(
      'Pedido nuevo #JMAXL98Z · acéptalo',
    )
    expect(
      attentionState([vm({ id: 'a', short_id: 'AAAA1111' }), vm({ id: 'b', short_id: 'BBBB2222' })])
        .banner?.label,
    ).toBe('2 pedidos requieren tu atención')
  })

  it('distingue el prepago: ahí lo que toca es revisar el pago, no aceptar', () => {
    const banner = attentionState([
      vm({
        status: 'validando',
        payment_intent: 'prepaid',
        short_id: 'PREP1234',
        validating_at: '2026-08-21T19:38:08Z',
      }),
    ]).banner
    expect(banner?.label).toBe('Pedido #PREP1234 · revisa el pago')
  })

  it('el reloj va en mm:ss y no baja de 00:00 aunque el cron llegue tarde', () => {
    // 19:38:08 + 5 min = 19:43:08; a las 19:40:00 quedan 3m08s.
    expect(attentionState([vm()]).banner?.countdownText).toBe('03:08')

    // Vencido hace rato: el cron lo mata en breve, pero mientras tanto la
    // cajera no debe ver un número negativo.
    const vencido = toOrderVM(
      row({ pending_acceptance_at: '2026-08-21T19:00:00Z' }),
      NOW,
      DEFAULT_ORDER_TIMERS,
    )
    expect(attentionState([vencido]).banner?.countdownText).toBe('00:00')
  })
})
