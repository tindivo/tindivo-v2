import { describe, expect, it } from 'vitest'
import { buildNegociosCardVM } from '../card-view-model'
import type { OrderRow } from '../view-model'
import { formatReadyDelta, toOrderVM } from '../view-model'

function mockOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord_123',
    short_id: '123',
    source: 'web',
    status: 'preparing',
    payment_intent: 'pending_cash',
    customer_name: 'Juan Perez',
    customer_phone: '999888777',
    delivery_address: null,
    delivery_reference: 'Calle San Martin 123',
    delivery_method: 'delivery',
    order_amount: 25.0,
    delivery_fee: 5.0,
    prep_time_minutes: 15,
    estimated_ready_at: null,
    ready_early_used: false,
    waiting_driver_at: null,
    picked_up_at: null,
    driver_id: null,
    driver: null,
    created_at: '2026-08-05T15:00:00Z',
    pending_acceptance_at: null,
    awaiting_payment_at: null,
    validating_at: null,
    pays_with_cash: null,
    cash_change: null,
    wallet_part: null,
    cash_part: null,
    requires_validation: false,
    validation_reason_code: null,
    risk_flags: {},
    prep_extension_count: 0,
    prep_extension_minutes: null,
    ready_early_at: null,
    proof_status: null,
    proof_url: null,
    proof_attempt: 0,
    delivered_at: null,
    cancelled_at: null,
    cancel_note: null,
    cancel_reason: null,
    ...overrides,
  }
}

describe('formatReadyDelta', () => {
  it('formatea deltas positivos sin signo y con padding mm:ss (ej. 04:30)', () => {
    expect(formatReadyDelta(270)).toBe('04:30')
    expect(formatReadyDelta(5)).toBe('00:05')
    expect(formatReadyDelta(0)).toBe('00:00')
  })

  it('formatea deltas negativos con signo menos y padding mm:ss (ej. -02:45, -00:05)', () => {
    expect(formatReadyDelta(-165)).toBe('-02:45')
    expect(formatReadyDelta(-5)).toBe('-00:05')
  })

  it('formatea deltas >= 60 minutos como Xh Ym (ej. 2h 05m, -2h 43m)', () => {
    expect(formatReadyDelta(7516)).toBe('2h 05m')
    expect(formatReadyDelta(-9814)).toBe('-2h 43m')
  })
})

describe('toOrderVM readySec calculation', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('1. estimated_ready_at en el futuro -> readySec positivo correcto', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: '2026-08-05T15:20:00Z', // +5 min (300 sec)
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBe(300)
    expect(formatReadyDelta(vm.readySec!)).toBe('05:00')
  })

  it('2. estimated_ready_at en el pasado, ready_early_used=false -> readySec negativo en cooking, heading, y waiting', () => {
    const pastReadyAt = '2026-08-05T15:12:15Z' // -2 min 45 sec (-165 sec)

    // Estado cooking (preparing)
    const vmCooking = toOrderVM(
      mockOrderRow({
        status: 'preparing',
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmCooking.state).toBe('cooking')
    expect(vmCooking.readySec).toBe(-165)
    expect(formatReadyDelta(vmCooking.readySec!)).toBe('-02:45')

    // Estado heading (heading_to_restaurant o waiting_driver con driver_id)
    const vmHeading = toOrderVM(
      mockOrderRow({
        status: 'heading_to_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmHeading.state).toBe('heading')
    expect(vmHeading.readySec).toBe(-165)

    // Estado waiting (waiting_at_restaurant)
    const vmWaiting = toOrderVM(
      mockOrderRow({
        status: 'waiting_at_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        estimated_ready_at: pastReadyAt,
        ready_early_used: false,
      }),
      baseNow,
    )
    expect(vmWaiting.state).toBe('waiting')
    expect(vmWaiting.readySec).toBe(-165)
  })

  it('3. estimated_ready_at en el pasado, ready_early_used=true -> readySec negativo (-300s)', () => {
    const row = mockOrderRow({
      status: 'preparing',
      estimated_ready_at: '2026-08-05T15:10:00Z',
      ready_early_used: true,
    })
    const vm = toOrderVM(row, baseNow)
    expect(vm.readySec).toBe(-300)
  })

  const readyAtPlus10 = '2026-08-05T15:25:00Z' // baseNow + 10 min

  it('4. readyEarly en `cooking`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'preparing',
        driver_id: null,
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('cooking')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })

  it('5. readyEarly en `heading`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'heading_to_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('heading')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })

  it('6. readyEarly en `waiting`: readySec (600s) y minutesLeft (10m) siguen contando', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'waiting_at_restaurant',
        driver_id: 'drv_1',
        driver: { full_name: 'Carlos Chofer' },
        ready_early_used: true,
        estimated_ready_at: readyAtPlus10,
      }),
      baseNow,
    )
    expect(vm.state).toBe('waiting')
    expect(vm.readyEarly).toBe(true)
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)
  })
})

/**
 * EL RELOJ NO SE APAGA AL PULSAR "PEDIDO LISTO".
 *
 * `advance_order('ready')` sin motorizado pasa el status a `waiting_driver`, y
 * sin `driver_id` eso cae en `buffer_p1`. Ese estado no estaba en la lista de
 * los que cuentan, así que `readySec` y `minutesLeft` se volvían `null` de golpe
 * y la cajera perdía el cronómetro justo al marcar la comida lista — la misma
 * regresión que `DECISIONS §23` prohibió, entrando por la puerta del estado en
 * vez de por la de `ready_early_used`.
 */
describe('el cronómetro sobrevive a "Pedido listo" (DECISIONS §23)', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')
  /** Lo que deja el RPC: `least(estimated_ready_at, now() + queue_lead)`. */
  const enDiezMinutos = '2026-08-05T15:25:00Z'

  it('sin motorizado (buffer_p1) el reloj SIGUE contando tras marcar listo', () => {
    const row = mockOrderRow({
      status: 'waiting_driver',
      driver_id: null,
      waiting_driver_at: '2026-08-05T15:15:00Z',
      ready_early_used: true,
      estimated_ready_at: enDiezMinutos,
    })
    const vm = toOrderVM(row, baseNow)

    expect(vm.state).toBe('buffer_p1')
    expect(vm.readySec).toBe(600)
    expect(vm.minutesLeft).toBe(10)

    const card = buildNegociosCardVM(vm)
    expect(card.clock).not.toBeNull()
    expect(card.clock?.text).toBe('10:00')
  })

  it('sigue contando también en buffer_p2 y buffer_p3, que es cuando más urge', () => {
    for (const [waitingSince, esperado] of [
      ['2026-08-05T15:12:00Z', 'buffer_p2'],
      ['2026-08-05T15:09:00Z', 'buffer_p3'],
    ] as const) {
      const vm = toOrderVM(
        mockOrderRow({
          status: 'waiting_driver',
          driver_id: null,
          waiting_driver_at: waitingSince,
          ready_early_used: true,
          estimated_ready_at: enDiezMinutos,
        }),
        baseNow,
      )
      expect(vm.state).toBe(esperado)
      expect(vm.readySec).toBe(600)
      expect(buildNegociosCardVM(vm).clock?.text).toBe('10:00')
    }
  })

  it('con motorizado asignado el reloj tampoco se apaga', () => {
    const vm = toOrderVM(
      mockOrderRow({
        status: 'heading_to_restaurant',
        driver_id: 'drv_1',
        ready_early_used: true,
        estimated_ready_at: enDiezMinutos,
      }),
      baseNow,
    )
    expect(vm.state).toBe('heading')
    expect(vm.readySec).toBe(600)
    expect(buildNegociosCardVM(vm).clock?.text).toBe('10:00')
  })

  it('§23: con la comida lista el copy culpa al reparto, no a la cocina', () => {
    const vencidoHace5Min = '2026-08-05T15:10:00Z'

    const lista = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({
          status: 'waiting_driver',
          driver_id: null,
          waiting_driver_at: '2026-08-05T15:14:00Z',
          ready_early_used: true,
          estimated_ready_at: vencidoHace5Min,
        }),
        baseNow,
      ),
    )
    expect(lista.clock?.label).toBe('Lista · esperando moto')
    expect(lista.clock?.readyBadge).toBe(true)
    // SIN signo: con la comida lista el número es tiempo de espera, no déficit.
    // Pintaba `✓ -05:00`, un visto de "bien" pegado a un menos de "mal".
    expect(lista.clock?.text).toBe('05:00')

    // "Demorado" exige que la comida PUEDA seguir en la cocina, y eso solo pasa
    // en `cooking`: en los `buffer_*` el estado ya garantiza que está hecha.
    const enCocina = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({
          status: 'preparing',
          ready_early_used: false,
          estimated_ready_at: vencidoHace5Min,
        }),
        baseNow,
      ),
    )
    expect(enCocina.clock?.label).toBe('Demorado')
    // CON signo: aquí sí es un retraso contra la promesa de la cocina.
    expect(enCocina.clock?.text).toBe('-05:00')
  })

  it('en los buffer_* la comida está lista por el ESTADO, aunque falte la marca', () => {
    // El caso real que destapó la contradicción (#DEMZDD55 en el tablero):
    // insignia "Lista · esperando moto" y reloj "Demorado" en el mismo pedido.
    const vm = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({
          status: 'waiting_driver',
          driver_id: null,
          waiting_driver_at: '2026-08-05T15:14:00Z',
          ready_early_used: false, // la cajera nunca pulsó el botón
          estimated_ready_at: '2026-08-05T15:10:00Z',
        }),
        baseNow,
      ),
    )
    expect(vm.stateBadge.label).toBe('Lista · esperando moto')
    expect(vm.clock?.label).toBe('Lista · esperando moto')
    expect(vm.clock?.readyBadge).toBe(true)
  })
})

describe('el borde de la tarjeta escala igual que el reloj', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  /** Retraso de cocina de `min` minutos, sin motorizado. */
  const conRetraso = (min: number) =>
    toOrderVM(
      mockOrderRow({
        status: 'preparing',
        estimated_ready_at: new Date(baseNow - min * 60_000).toISOString(),
        ready_early_used: false,
      }),
      baseNow,
    )

  it('dentro del margen es ámbar; pasado el margen sube a rojo', () => {
    const opts = { queueLeadMin: 10 }
    expect(buildNegociosCardVM(conRetraso(4), opts).tone).toBe('warning')
    expect(buildNegociosCardVM(conRetraso(4), opts).clock?.tone).toBe('warning')

    // A los 25 minutos el reloj ya gritaba en rojo, pero el borde seguía ámbar:
    // el mismo hecho con dos gravedades distintas.
    expect(buildNegociosCardVM(conRetraso(25), opts).tone).toBe('danger')
    expect(buildNegociosCardVM(conRetraso(25), opts).clock?.tone).toBe('danger')
  })

  it('el umbral sale de app_settings, no del código', () => {
    expect(buildNegociosCardVM(conRetraso(25), { queueLeadMin: 30 }).tone).toBe('warning')
  })
})

describe('cada hecho se dice una sola vez', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('la insignia enuncia el hecho y el botón da la orden, sin repetirse', () => {
    const vm = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({ status: 'waiting_driver', waiting_driver_at: '2026-08-05T15:00:00Z' }),
        baseNow,
      ),
    )
    // La insignia ya no grita el mismo imperativo que el botón de debajo.
    expect(vm.stateBadge.label).toBe('Sin motorizado')
    expect(vm.primaryAction?.label).toBe('Pedir motorizado YA')
  })

  it('con el motorizado en la puerta, el reloj no dice que se le espera', () => {
    const vm = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({
          status: 'waiting_at_restaurant',
          driver_id: 'drv_1',
          driver: { full_name: 'Carlos Chofer' },
          ready_early_used: true,
          estimated_ready_at: '2026-08-05T15:06:00Z', // lista hace 9 min
        }),
        baseNow,
      ),
    )
    expect(vm.stateBadge.label).toBe('Motorizado llegó')
    expect(vm.clock?.label).toBe('Moto esperando')
    expect(vm.clock?.text).toBe('09:00')
  })
})

describe('el reloj de reparto, que la columna prometía y no existía', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('cuenta hacia arriba desde la recogida', () => {
    const vm = toOrderVM(
      mockOrderRow({ status: 'picked_up', picked_up_at: '2026-08-05T15:03:00Z' }),
      baseNow,
    )
    expect(vm.deliverySec).toBe(720)

    const card = buildNegociosCardVM(vm)
    expect(card.clock?.text).toBe('12:00')
    expect(card.clock?.label).toBe('En reparto')
    expect(card.clock?.tone).toBe('neutral')
  })

  it('se pone rojo pasado deliveryLateMinutes, el mismo umbral que motorizados', () => {
    const vm = toOrderVM(
      mockOrderRow({ status: 'picked_up', picked_up_at: '2026-08-05T14:50:00Z' }), // 25 min
      baseNow,
    )
    expect(buildNegociosCardVM(vm, { deliveryLateMin: 20 }).clock?.tone).toBe('danger')
    // Con el umbral subido, el mismo pedido deja de ser tarde: sale de
    // `app_settings`, no del código.
    expect(buildNegociosCardVM(vm, { deliveryLateMin: 30 }).clock?.tone).toBe('neutral')
  })

  it('fuera de reparto no hay reloj de reparto', () => {
    const vm = toOrderVM(mockOrderRow({ status: 'preparing' }), baseNow)
    expect(vm.deliverySec).toBeNull()
  })
})

describe('la cejilla solo enseña lo que distingue', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  it('el origen manual no se marca (es el 100% del piloto); el web sí', () => {
    expect(
      buildNegociosCardVM(toOrderVM(mockOrderRow({ source: 'business_manual' }), baseNow))
        .sourceBadge,
    ).toBeNull()

    const web = buildNegociosCardVM(toOrderVM(mockOrderRow({ source: 'customer_pwa' }), baseNow))
    expect(web.sourceBadge?.label).toBe('Online')
  })

  it('el delivery no se marca; el recojo en local sí', () => {
    expect(
      buildNegociosCardVM(toOrderVM(mockOrderRow({ delivery_method: 'delivery' }), baseNow))
        .methodBadge,
    ).toBeNull()

    const pickup = buildNegociosCardVM(
      toOrderVM(mockOrderRow({ delivery_method: 'pickup' }), baseNow),
    )
    expect(pickup.methodBadge?.label).toBe('Recojo en local')
  })

  it('sin nombre la identidad es el código, y entonces la cejilla no lo repite', () => {
    const sinNombre = buildNegociosCardVM(
      toOrderVM(mockOrderRow({ customer_name: null, short_id: 'HVW95B8N' }), baseNow),
    )
    expect(sinNombre.customerName).toBe('#HVW95B8N')
    expect(sinNombre.identityIsCode).toBe(true)

    const conNombre = buildNegociosCardVM(
      toOrderVM(mockOrderRow({ customer_name: 'Rosa Quispe' }), baseNow),
    )
    expect(conNombre.customerName).toBe('Rosa Quispe')
    expect(conNombre.identityIsCode).toBe(false)
  })

  it('un nombre en blanco cuenta como ausente', () => {
    const vm = buildNegociosCardVM(
      toOrderVM(mockOrderRow({ customer_name: '   ', short_id: 'ABC12345' }), baseNow),
    )
    expect(vm.customerName).toBe('#ABC12345')
  })
})

describe('buildNegociosCardVM', () => {
  const baseNow = Date.parse('2026-08-05T15:15:00Z')

  // El origen ya no se afirma aquí: la regla es "solo cuando es la excepción" y
  // vive en `la cejilla solo enseña lo que distingue`, arriba. Este test decía
  // que el manual SIEMPRE lleva insignia, que es justo lo que se quitó.

  it('destaca el vuelto a entregar en efectivo, con el "paga con" al lado', () => {
    const row = mockOrderRow({
      payment_intent: 'pending_cash',
      client_pays_with: 50.0,
      change_to_give: 20.0,
      order_amount: 25.0,
      delivery_fee: 5.0,
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow))
    expect(cardVm.money.status).toBe('collect')
    expect(cardVm.money.paymentLabel).toBe('Cobrar en efectivo')
    expect(cardVm.money.paysWithText).toBe('Paga con S/ 50')
    expect(cardVm.money.cashChangeText).toBe('Vuelto a entregar: S/ 20')
  })

  it('sin vuelto pero con "paga con", avisa que paga justo', () => {
    const row = mockOrderRow({
      payment_intent: 'pending_cash',
      client_pays_with: 30.0,
      change_to_give: 0,
      order_amount: 25.0,
      delivery_fee: 5.0,
    })
    const money = buildNegociosCardVM(toOrderVM(row, baseNow)).money
    expect(money.cashChangeText).toBeNull()
    expect(money.paysWithText).toBe('Paga justo con S/ 30')
  })

  it('sin `client_pays_with` no afirma nada sobre el vuelto', () => {
    const money = buildNegociosCardVM(
      toOrderVM(mockOrderRow({ payment_intent: 'pending_cash' }), baseNow),
    ).money
    expect(money.paysWithText).toBeNull()
    expect(money.cashChangeText).toBeNull()
  })

  it('el cobro mixto enseña el desglose billetera + efectivo', () => {
    const row = mockOrderRow({
      payment_intent: 'pending_mixed',
      order_amount: 25.0,
      delivery_fee: 5.0,
      yape_amount: 18.0,
      cash_amount: 12.0,
    })
    const money = buildNegociosCardVM(toOrderVM(row, baseNow)).money
    expect(money.status).toBe('collect')
    expect(money.breakdown).toBe('S/ 18 Yape/Plin + S/ 12 efectivo')
  })

  it('en mixto el "paga con" dice que es del efectivo, no del total', () => {
    const row = mockOrderRow({
      payment_intent: 'pending_mixed',
      order_amount: 25.0,
      delivery_fee: 5.0,
      yape_amount: 18.0,
      cash_amount: 12.0,
      client_pays_with: 20.0,
      change_to_give: 8.0,
    })
    const money = buildNegociosCardVM(toOrderVM(row, baseNow)).money
    expect(money.paysWithText).toBe('Paga el efectivo con S/ 20')
    expect(money.cashChangeText).toBe('Vuelto a entregar: S/ 8')
  })

  it('en billetera y prepago no hay ni vuelto ni desglose', () => {
    for (const intent of ['pending_yape', 'prepaid']) {
      const money = buildNegociosCardVM(
        toOrderVM(mockOrderRow({ payment_intent: intent, change_to_give: 20 }), baseNow),
      ).money
      expect(money.cashChangeText).toBeNull()
      expect(money.breakdown).toBeNull()
    }
  })

  describe('un manual prepagado no tiene nada que verificar', () => {
    /**
     * La cajera cobró antes de crear el pedido, así que
     * `create_business_manual_order` deja `payment_proof_status` en NULL para
     * siempre. Sin la rama por origen, ese NULL se leía como "pendiente" y la
     * tarjeta le pedía revisar un comprobante inexistente (#EWWLWNCV).
     */
    const manualPrepago = buildNegociosCardVM(
      toOrderVM(
        mockOrderRow({
          source: 'business_manual',
          payment_intent: 'prepaid',
          payment_proof_status: null,
        }),
        baseNow,
      ),
    ).money

    it('dice que no se cobra, en vez de pedir una verificación imposible', () => {
      expect(manualPrepago.status).toBe('paid')
      expect(manualPrepago.paymentLabel).toBe('Prepagado · no cobrar')
    })

    it('esconde la cifra: enseñarla invita a cobrarla por error', () => {
      expect(manualPrepago.showTotal).toBe(false)
    })
  })

  describe('el prepago sin verificar no se parece al verificado', () => {
    const prepago = (proof: string | null) =>
      buildNegociosCardVM(
        toOrderVM(
          mockOrderRow({
            source: 'customer_pwa',
            payment_intent: 'prepaid',
            payment_proof_status: proof,
          }),
          baseNow,
        ),
      ).money

    it('verificado: la plata ya entró, y la cifra se retira con ella', () => {
      expect(prepago('verified').status).toBe('paid')
      expect(prepago('verified').paymentLabel).toBe('Pagado · no cobrar')
      expect(prepago('verified').showTotal).toBe(false)
    })

    it('pendiente o sin comprobante: es trabajo de la cajera', () => {
      expect(prepago('pending').status).toBe('unverified')
      expect(prepago(null).status).toBe('unverified')
      expect(prepago(null).paymentLabel).toBe('Falta verificar el pago')
      // La cifra SÍ se queda: es contra lo que compara el comprobante.
      expect(prepago(null).showTotal).toBe(true)
    })

    it('rechazado: se dice, no se calla', () => {
      expect(prepago('rejected').status).toBe('rejected')
      expect(prepago('rejected').paymentLabel).toBe('Comprobante rechazado')
    })
  })

  describe('destino: el online trae dirección Y referencia', () => {
    it('el manual enseña una sola línea: el relleno "Pedido manual" no sale', () => {
      const dest = buildNegociosCardVM(
        toOrderVM(
          mockOrderRow({
            source: 'business_manual',
            delivery_address: 'Pedido manual',
            delivery_reference: 'Renovacion, casa de Lali',
          }),
          baseNow,
        ),
      ).destination
      expect(dest).toEqual({ primary: 'Renovacion, casa de Lali', secondary: null })
    })

    it('el online enseña las dos, con la referencia primero', () => {
      const dest = buildNegociosCardVM(
        toOrderVM(
          mockOrderRow({
            source: 'customer_pwa',
            delivery_address: 'Jr. Lima 234',
            delivery_reference: 'Porton azul, al lado de la bodega',
          }),
          baseNow,
        ),
      ).destination
      expect(dest).toEqual({
        primary: 'Porton azul, al lado de la bodega',
        secondary: 'Jr. Lima 234',
      })
    })

    it('un online sin referencia cae a la dirección', () => {
      const dest = buildNegociosCardVM(
        toOrderVM(
          mockOrderRow({
            source: 'customer_pwa',
            delivery_address: 'Jr. Lima 234',
            delivery_reference: null,
          }),
          baseNow,
        ),
      ).destination
      expect(dest).toEqual({ primary: 'Jr. Lima 234', secondary: null })
    })

    it('el recojo en local no lleva dirección de nadie', () => {
      const dest = buildNegociosCardVM(
        toOrderVM(
          mockOrderRow({
            source: 'customer_pwa',
            delivery_method: 'pickup',
            delivery_address: 'Recojo en tienda',
            delivery_reference: null,
          }),
          baseNow,
        ),
      ).destination
      expect(dest).toEqual({ primary: 'Recojo en local', secondary: null })
    })
  })

  it('asigna la acción 1-tap "Motorizado llegó · Entregar" cuando el motorizado está en la puerta', () => {
    const row = mockOrderRow({
      status: 'waiting_at_restaurant',
      driver_id: 'drv_1',
      driver: { full_name: 'Carlos Chofer' },
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow))
    expect(cardVm.primaryAction?.type).toBe('deliver')
    expect(cardVm.primaryAction?.label).toContain('Carlos Chofer llegó · Entregar')
  })

  it('asigna la acción 1-tap "Pedir motorizado YA" en buffer_p3', () => {
    const row = mockOrderRow({
      status: 'waiting_driver',
      waiting_driver_at: '2026-08-05T15:00:00Z', // 15 min esperando moto
    })
    const cardVm = buildNegociosCardVM(toOrderVM(row, baseNow), { supportPhone: '999111222' })
    expect(cardVm.primaryAction?.type).toBe('callDriver')
    expect(cardVm.primaryAction?.label).toBe('Pedir motorizado YA')
  })
})
