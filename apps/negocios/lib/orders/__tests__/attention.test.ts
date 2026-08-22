import { ORDER_STATUSES, type OrderStatus } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { attentionState, newColumnSubtitle, sortNew } from '../attention'
import { buildNegociosCardVM } from '../card-view-model'
import { DEFAULT_ORDER_TIMERS, type OrderRow, type OrderVM, toOrderVM } from '../view-model'

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

/**
 * EL LATIDO DE LA TARJETA, QUE ES EL MISMO HECHO UNA TERCERA VEZ.
 *
 * El sonido y el banner ya salían de la misma llamada. La tarjeta era la que
 * faltaba: se veía, sí, pero se veía IGUAL que las otras nueve, y la cajera que
 * está tecleando un pedido manual necesita que el tablero le diga cuál mirar,
 * no que estén todos ahí.
 *
 * Estos tests atan el latido al mismo predicado (`demandsCashier`) para que no
 * pueda irse por su cuenta: cualquiera que cambie qué reclama a la cajera mueve
 * las tres superficies a la vez o rompe el primer test.
 */
describe('el latido de la tarjeta · «oye, atiende a esto»', () => {
  const pulse = (o: Partial<OrderRow> = {}) => buildNegociosCardVM(vm(o)).pulse

  it('para TODO estado del enum, la tarjeta late ⟺ suena la alarma', () => {
    for (const status of ORDER_STATUSES satisfies readonly OrderStatus[]) {
      const order = vm({ status })
      expect(buildNegociosCardVM(order).pulse !== 'none', `estado ${status}`).toBe(
        attentionState([order]).hasPending,
      )
    }
  })

  /** El viaje que pidió el piloto: late, se calma, vuelve a latir. */
  it('el prepago late al entrar, se calma esperando al cliente y vuelve con el comprobante', () => {
    expect(pulse({ status: 'pending_acceptance', payment_intent: 'prepaid' })).toBe('attention')

    // Aceptado. La pelota es del cliente: paga y sube la captura.
    expect(
      pulse({
        status: 'awaiting_payment',
        payment_intent: 'prepaid',
        awaiting_payment_at: '2026-08-21T19:39:00Z',
      }),
    ).toBe('none')

    // Llegó la captura. Toca mirarla, y el latido vuelve.
    expect(
      pulse({
        status: 'validando',
        payment_intent: 'prepaid',
        comprobante_prepago_url: 'proofs/ord_1.jpg',
        validating_at: '2026-08-21T19:39:00Z',
      }),
    ).toBe('attention')
  })

  it('en contraentrega se acepta y se acabó: en cocina ya no late', () => {
    expect(pulse({ status: 'pending_acceptance', payment_intent: 'pending_cash' })).toBe(
      'attention',
    )
    expect(pulse({ status: 'preparing', payment_intent: 'pending_cash' })).toBe('none')
  })

  it('en el último minuto sube a urgente, el mismo umbral que el reloj y el borde', () => {
    // 19:35:30 + 5 min = 19:40:30; a las 19:40:00 quedan 30 segundos.
    const alFilo = vm({ pending_acceptance_at: '2026-08-21T19:35:30Z' })
    expect(alFilo.countdownSec).toBeLessThan(60)
    expect(buildNegociosCardVM(alFilo).pulse).toBe('urgent')
    expect(buildNegociosCardVM(alFilo).tone).toBe('danger')
  })

  it('el reparto tardío NO late: es grave, pero no es cosa de la cajera', () => {
    // Sigue poniendo el reloj en rojo —y con él el aura de la tarjeta—, que es
    // justo la distinción: el aura pesa, el latido pide.
    const tardio = vm({
      status: 'picked_up',
      picked_up_at: '2026-08-21T19:10:00Z',
      estimated_ready_at: '2026-08-21T19:20:00Z',
    })
    const card = buildNegociosCardVM(tardio, { deliveryLateMin: 20 })
    expect(card.clock?.tone).toBe('danger')
    expect(card.pulse).toBe('none')
  })
})

/**
 * EL ORDEN DE LA COLUMNA «NUEVOS».
 *
 * La consulta trae `created_at DESC`, así que sin ordenar la columna enseñaba el
 * pedido más reciente arriba y el que está a punto de autocancelarse abajo.
 */
describe('sortNew · primero lo que se muere antes', () => {
  const ids = (vms: OrderVM[]) => [...vms].sort(sortNew).map((v) => v.id)

  it('lo que la reclama va por delante, aunque haya llegado después', () => {
    // El `awaiting_payment` lleva más rato y le queda menos margen relativo,
    // pero ese reloj lo corre el cliente: ella no tiene nada que hacer con él.
    const esperandoPago = vm({
      id: 'a',
      short_id: 'PAGOAAAA',
      status: 'awaiting_payment',
      awaiting_payment_at: '2026-08-21T19:30:00Z',
    })
    const porAceptar = vm({
      id: 'b',
      short_id: 'NUEVBBBB',
      pending_acceptance_at: '2026-08-21T19:39:30Z',
    })
    expect(ids([esperandoPago, porAceptar])).toEqual(['NUEVBBBB', 'PAGOAAAA'])
  })

  it('entre dos que la reclaman manda el reloj, no la antigüedad', () => {
    // El `validando` de prepago tiene 10 minutos y llegó antes; el
    // `pending_acceptance` tiene 5 y llegó después, y se muere primero.
    const viejo = vm({
      id: 'a',
      short_id: 'VIEJAAAA',
      status: 'validando',
      payment_intent: 'prepaid',
      validating_at: '2026-08-21T19:36:00Z',
    })
    const reciente = vm({
      id: 'b',
      short_id: 'RECIBBBB',
      pending_acceptance_at: '2026-08-21T19:38:00Z',
    })
    expect(viejo.countdownSec).toBeGreaterThan(reciente.countdownSec)
    expect(ids([viejo, reciente])).toEqual(['RECIBBBB', 'VIEJAAAA'])
  })

  it('la primera tarjeta es la misma a la que apunta el banner', () => {
    // Si discreparan, el banner mandaría a la cajera a un pedido y la columna le
    // enseñaría otro arriba del todo.
    const lista = [
      vm({ id: 'a', short_id: 'AAAA1111', pending_acceptance_at: '2026-08-21T19:39:00Z' }),
      vm({
        id: 'b',
        short_id: 'BBBB2222',
        status: 'awaiting_payment',
        awaiting_payment_at: '2026-08-21T19:38:00Z',
      }),
      vm({ id: 'c', short_id: 'CCCC3333', pending_acceptance_at: '2026-08-21T19:36:30Z' }),
    ]
    expect(ids(lista)[0]).toBe(attentionState(lista).banner?.target.id)
  })

  it('los que no la reclaman también se ordenan por reloj entre ellos', () => {
    const tarde = vm({
      id: 'a',
      short_id: 'TARDAAAA',
      status: 'awaiting_payment',
      awaiting_payment_at: '2026-08-21T19:39:00Z',
    })
    const pronto = vm({
      id: 'b',
      short_id: 'PRONBBBB',
      status: 'awaiting_payment',
      awaiting_payment_at: '2026-08-21T19:31:00Z',
    })
    expect(ids([tarde, pronto])).toEqual(['PRONBBBB', 'TARDAAAA'])
  })
})

describe('newColumnSubtitle · el chip cuenta la columna, el subtitulo la reparte', () => {
  const esperandoPago = (id: string) =>
    vm({ id, short_id: id.toUpperCase().padEnd(8, 'X'), status: 'awaiting_payment' })
  const porAceptar = (id: string) => vm({ id, short_id: id.toUpperCase().padEnd(8, 'X') })

  it('separa lo que le toca de lo que espera al cliente', () => {
    expect(newColumnSubtitle([porAceptar('a'), porAceptar('b'), esperandoPago('c')])).toBe(
      '2 te esperan · 1 esperando al cliente',
    )
  })

  it('en singular no dice "1 te esperan"', () => {
    expect(newColumnSubtitle([porAceptar('a')])).toBe('1 te espera')
  })

  it('sin nada suyo no la interpela', () => {
    expect(newColumnSubtitle([esperandoPago('a'), esperandoPago('b')])).toBe(
      '2 esperando al cliente',
    )
  })

  it('con la columna vacía vuelve a la instrucción de siempre', () => {
    expect(newColumnSubtitle([])).toBe('Revisar antes de aceptar')
  })
})
