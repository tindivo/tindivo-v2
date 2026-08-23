import { ORDER_STATUSES, type OrderStatus } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import {
  attentionKey,
  attentionState,
  LAST_CALL_SEC,
  newColumnSubtitle,
  nextBeepDelay,
  sortNew,
} from '../attention'
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

/**
 * SELLOS DERIVADOS DEL PLAZO, NO A LA INVERSA.
 *
 * La primera versión de estos tests escribía la hora a mano —«19:35:30, o sea
 * treinta segundos»— y eso ataba cada assert a que la ventana de aceptación
 * fuese de cinco minutos. El día que `app_settings` la subió a ocho (migración
 * 0186), diez tests se pusieron rojos a la vez sin que nadie hubiera tocado lo
 * que probaban. El plazo es un parámetro operativo y va a seguir moviéndose.
 *
 * Ahora se declara lo que importa —«a este le quedan treinta segundos»— y el
 * sello se calcula desde `DEFAULT_ORDER_TIMERS`.
 */
const sello = (restanSec: number, plazoMin: number) =>
  new Date(NOW - (plazoMin * 60 - restanSec) * 1000).toISOString()

const T = DEFAULT_ORDER_TIMERS

/** Un `pending_acceptance` al que le quedan `restanSec` segundos. */
const porAceptar = (restanSec: number, extra: Partial<OrderRow> = {}) =>
  vm({ pending_acceptance_at: sello(restanSec, T.acceptanceMinutes), ...extra })

/** Un prepago en `validando` (la captura ya subida) al que le quedan `restanSec`. */
const revisandoPago = (restanSec: number, extra: Partial<OrderRow> = {}) =>
  vm({
    status: 'validando',
    payment_intent: 'prepaid',
    comprobante_prepago_url: 'proofs/x.jpg',
    validating_at: sello(restanSec, T.prepayVerificationMinutes),
    ...extra,
  })

/** Un `awaiting_payment` (la pelota la tiene el cliente) al que le quedan `restanSec`. */
const esperandoAlCliente = (restanSec: number, extra: Partial<OrderRow> = {}) =>
  vm({
    status: 'awaiting_payment',
    awaiting_payment_at: sello(restanSec, T.paymentMinutes),
    ...extra,
  })

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
  it('para TODO estado del enum, sonar ⟺ hay banner', () => {
    for (const status of ORDER_STATUSES satisfies readonly OrderStatus[]) {
      const state = attentionState([vm({ status })])
      expect(state.alarm.hasPending, `estado ${status}`).toBe(state.banner !== null)
      expect(state.alarm.count, `estado ${status}`).toBe(state.orders.length)
    }
  })

  it('sin pedidos no hay alarma ni banner', () => {
    const state = attentionState([])
    expect(state.alarm.hasPending).toBe(false)
    expect(state.alarm.count).toBe(0)
    expect(state.banner).toBeNull()
  })
})

describe('attentionState · qué reclama a la cajera', () => {
  it('reclama en pending_acceptance y en validando', () => {
    expect(attentionState([porAceptar(120)]).alarm.hasPending).toBe(true)
    expect(attentionState([revisandoPago(120)]).alarm.hasPending).toBe(true)
  })

  it('NO reclama en awaiting_payment: la pelota la tiene el cliente', () => {
    // El pedido sí es "nuevo" para `getColumn` —y su tarjeta se ve— pero la
    // cajera no tiene nada que hacer hasta que llegue la captura. Despertarla
    // aquí sería alarma sin acción posible.
    const state = attentionState([esperandoAlCliente(120)])
    expect(state.alarm.hasPending).toBe(false)
    expect(state.banner).toBeNull()
  })

  it('ignora los que ya están en cocina, en reparto o cerrados', () => {
    const state = attentionState([
      vm({ status: 'preparing' }),
      vm({ status: 'picked_up' }),
      vm({ status: 'delivered' }),
      vm({ status: 'cancelled' }),
    ])
    expect(state.alarm.hasPending).toBe(false)
  })
})

describe('attentionState · el banner', () => {
  it('apunta al MÁS urgente, no al más antiguo', () => {
    // El prepago en validación llegó antes y tiene ventana más larga; al que
    // hay que atender primero es al otro, aunque entrara después.
    const viejo = revisandoPago(300, { id: 'ord_viejo', short_id: 'VIEJO111' })
    const urgente = porAceptar(90, { id: 'ord_urgente', short_id: 'URGE2222' })
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
    expect(attentionState([porAceptar(188)]).banner?.countdownText).toBe('03:08')

    // Vencido hace rato: el cron lo mata en breve, pero mientras tanto la
    // cajera no debe ver un número negativo.
    expect(attentionState([porAceptar(-600)]).banner?.countdownText).toBe('00:00')
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

  it('para TODO estado del enum, la tarjeta late ⟺ el pedido la reclama', () => {
    for (const status of ORDER_STATUSES satisfies readonly OrderStatus[]) {
      const order = vm({ status })
      const st = attentionState([order])
      expect(buildNegociosCardVM(order).pulse !== 'none', `estado ${status}`).toBe(
        st.orders.length > 0,
      )
      // Y mientras no haya acuses de por medio, lo que se ve es exactamente lo
      // que suena. El acuse solo puede quitar de un lado: ver más abajo.
      expect(st.alarm.hasPending, `estado ${status}`).toBe(st.orders.length > 0)
    }
  })

  it('acusado el pedido, la tarjeta SIGUE latiendo aunque ya no suene', () => {
    // El acuse dice «ya lo vi», no «ya lo resolví». Apagar el latido aquí sería
    // dejar el pedido sin ninguna señal, que es el fallo que costó JMAXL98Z.
    const pedido = porAceptar(240)
    const st = attentionState([pedido], new Set([attentionKey(pedido)]))
    expect(st.alarm.hasPending).toBe(false)
    expect(buildNegociosCardVM(pedido).pulse).toBe('attention')
  })

  /** El viaje que pidió el piloto: late, se calma, vuelve a latir. */
  it('el prepago late al entrar, se calma esperando al cliente y vuelve con el comprobante', () => {
    expect(buildNegociosCardVM(porAceptar(200, { payment_intent: 'prepaid' })).pulse).toBe(
      'attention',
    )

    // Aceptado. La pelota es del cliente: paga y sube la captura.
    expect(buildNegociosCardVM(esperandoAlCliente(600)).pulse).toBe('none')

    // Llegó la captura. Toca mirarla, y el latido vuelve.
    expect(buildNegociosCardVM(revisandoPago(400)).pulse).toBe('attention')
  })

  it('en contraentrega se acepta y se acabó: en cocina ya no late', () => {
    expect(buildNegociosCardVM(porAceptar(200, { payment_intent: 'pending_cash' })).pulse).toBe(
      'attention',
    )
    expect(pulse({ status: 'preparing', payment_intent: 'pending_cash' })).toBe('none')
  })

  it('en el último minuto sube a urgente, el mismo umbral que el reloj y el borde', () => {
    const alFilo = porAceptar(30)
    expect(alFilo.countdownSec).toBeLessThan(LAST_CALL_SEC)
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
    // Al `awaiting_payment` le queda muchísimo menos, pero ese reloj lo corre el
    // cliente: ella no tiene nada que hacer con él.
    const suyo = esperandoAlCliente(45, { id: 'a', short_id: 'PAGOAAAA' })
    const mio = porAceptar(400, { id: 'b', short_id: 'NUEVBBBB' })
    expect(ids([suyo, mio])).toEqual(['NUEVBBBB', 'PAGOAAAA'])
  })

  it('entre dos que la reclaman manda el reloj, no la antigüedad', () => {
    // El `validando` de prepago llegó antes y tiene ventana más larga; el
    // `pending_acceptance` llegó después y se muere primero.
    const viejo = revisandoPago(400, { id: 'a', short_id: 'VIEJAAAA' })
    const reciente = porAceptar(120, { id: 'b', short_id: 'RECIBBBB' })
    expect(viejo.countdownSec).toBeGreaterThan(reciente.countdownSec)
    expect(ids([viejo, reciente])).toEqual(['RECIBBBB', 'VIEJAAAA'])
  })

  it('la primera tarjeta es la misma a la que apunta el banner', () => {
    // Si discreparan, el banner mandaría a la cajera a un pedido y la columna le
    // enseñaría otro arriba del todo.
    const lista = [
      porAceptar(300, { id: 'a', short_id: 'AAAA1111' }),
      esperandoAlCliente(200, { id: 'b', short_id: 'BBBB2222' }),
      porAceptar(150, { id: 'c', short_id: 'CCCC3333' }),
    ]
    expect(ids(lista)[0]).toBe(attentionState(lista).banner?.target.id)
  })

  it('los que no la reclaman también se ordenan por reloj entre ellos', () => {
    const tarde = esperandoAlCliente(600, { id: 'a', short_id: 'TARDAAAA' })
    const pronto = esperandoAlCliente(120, { id: 'b', short_id: 'PRONBBBB' })
    expect(ids([tarde, pronto])).toEqual(['PRONBBBB', 'TARDAAAA'])
  })
})

describe('newColumnSubtitle · el chip cuenta la columna, el subtitulo la reparte', () => {
  const suyo = (id: string) => esperandoAlCliente(300, { id, short_id: id.padEnd(8, 'X') })
  const mio = (id: string) => porAceptar(300, { id, short_id: id.padEnd(8, 'X') })

  it('separa lo que le toca de lo que espera al cliente', () => {
    expect(newColumnSubtitle([mio('a'), mio('b'), suyo('c')])).toBe(
      '2 te esperan · 1 esperando al cliente',
    )
  })

  it('en singular no dice "1 te esperan"', () => {
    expect(newColumnSubtitle([mio('a')])).toBe('1 te espera')
  })

  it('sin nada suyo no la interpela', () => {
    expect(newColumnSubtitle([suyo('a'), suyo('b')])).toBe('2 esperando al cliente')
  })

  it('con la columna vacía vuelve a la instrucción de siempre', () => {
    expect(newColumnSubtitle([])).toBe('Revisar antes de aceptar')
  })
})

/**
 * EL ACUSE DE RECIBO: ABRIR EL PEDIDO CALLA SU ALARMA, Y SOLO SU ALARMA.
 *
 * Del piloto volvió una queja sobre el aviso, y es la peor que puede volver:
 * que suena demasiado. Sonaba cada tres segundos durante los cinco minutos del
 * pedido, incluso mientras la cajera lo tenía abierto delante. La respuesta
 * natural a eso es apagar las alertas, y ahí se pierde el siguiente pedido.
 *
 * Lo que estos tests fijan es el reparto: el acuse toca `alarm` y NUNCA
 * `orders` ni `banner`. Si algún día alguien lo hace apagar lo visible, este
 * fichero se pone rojo — que es justo el error que costó `JMAXL98Z`.
 */
describe('attentionState · el acuse de recibo', () => {
  it('acusar calla el sonido y deja el banner y el latido intactos', () => {
    const pedido = porAceptar(240)
    const acusado = new Set([attentionKey(pedido)])

    const antes = attentionState([pedido])
    expect(antes.alarm.hasPending).toBe(true)

    const despues = attentionState([pedido], acusado)
    expect(despues.alarm.hasPending).toBe(false)
    expect(despues.alarm.count).toBe(0)
    // Lo visible no se entera de que existe el acuse.
    expect(despues.orders).toHaveLength(1)
    expect(despues.banner).not.toBeNull()
    expect(despues.banner?.label).toBe(antes.banner?.label)
  })

  it('lo que suena nunca es más que lo que se ve', () => {
    const lista = [porAceptar(240), revisandoPago(300), esperandoAlCliente(120)]
    for (const acusados of [
      new Set<string>(),
      new Set([attentionKey(lista[0] as OrderVM)]),
      new Set(lista.map(attentionKey)),
    ]) {
      const st = attentionState(lista, acusados)
      expect(st.alarm.orders.length).toBeLessThanOrEqual(st.orders.length)
      for (const o of st.alarm.orders) expect(st.orders).toContain(o)
      if (st.alarm.hasPending) expect(st.banner).not.toBeNull()
    }
  })

  it('acusar uno no calla al que entra después', () => {
    const visto = porAceptar(240, { id: 'a', short_id: 'VISTAAAA' })
    const nuevo = porAceptar(400, { id: 'b', short_id: 'NUEVBBBB' })
    const st = attentionState([visto, nuevo], new Set([attentionKey(visto)]))
    expect(st.alarm.count).toBe(1)
    expect(st.alarm.orders[0]?.id).toBe('NUEVBBBB')
  })

  it('EN EL ÚLTIMO MINUTO el acuse ya no vale: vuelve a sonar', () => {
    // Y esto es lo que impide que un «ya lo vi» de hace tres minutos deje morir
    // el pedido en silencio, que es exactamente cómo se perdió JMAXL98Z.
    const alFilo = porAceptar(LAST_CALL_SEC - 15)
    const st = attentionState([alFilo], new Set([attentionKey(alFilo)]))
    expect(st.alarm.hasPending).toBe(true)
    expect(st.alarm.urgent).toBe(true)
  })

  it('el acuse muere con la situación, no con el pedido: el prepago vuelve a sonar', () => {
    // Misma fila, dos momentos. Acusa el `pending_acceptance` (lo aceptó y con
    // eso lo calló); cuando el cliente sube el comprobante, el pedido pasa a
    // `validando` y esa situación no tiene acuse.
    const aceptando = porAceptar(240, { id: 'ord_x', short_id: 'PREPXXXX' })
    const acusado = new Set([attentionKey(aceptando)])
    expect(attentionState([aceptando], acusado).alarm.hasPending).toBe(false)

    const conComprobante = revisandoPago(500, { id: 'ord_x', short_id: 'PREPXXXX' })
    expect(conComprobante.rowId).toBe(aceptando.rowId)
    expect(attentionState([conComprobante], acusado).alarm.hasPending).toBe(true)
  })

  it('`urgent` mira solo lo que suena, no lo acusado que aún no está al filo', () => {
    const tranquilo = porAceptar(300, { id: 'a', short_id: 'CALMAAAA' })
    const st = attentionState([tranquilo], new Set([attentionKey(tranquilo)]))
    expect(st.alarm.urgent).toBe(false)
  })
})

describe('nextBeepDelay · el ritmo, que también sobraba', () => {
  it('arranca rápido para engancharla', () => {
    expect(nextBeepDelay({ elapsedMs: 0, urgent: false })).toBe(3_000)
    expect(nextBeepDelay({ elapsedMs: 29_000, urgent: false })).toBe(3_000)
  })

  it('pasada la tanda de enganche se espacia: el pedido sigue viéndose', () => {
    expect(nextBeepDelay({ elapsedMs: 30_000, urgent: false })).toBe(12_000)
    expect(nextBeepDelay({ elapsedMs: 4 * 60_000, urgent: false })).toBe(12_000)
  })

  it('en el último minuto vuelve al ritmo rápido, lleve el rato que lleve', () => {
    expect(nextBeepDelay({ elapsedMs: 4 * 60_000, urgent: true })).toBe(3_000)
  })
})
