import { describe, expect, it } from 'vitest'
import {
  esVentaPerdida,
  tituloVentaPerdida,
  totalPerdido,
  ventasPerdidasSinAvisar,
} from '../lost-sales'
import { DEFAULT_ORDER_TIMERS, type OrderRow, type OrderVM, toOrderVM } from '../view-model'

const NOW = Date.parse('2026-09-09T02:00:00Z')

function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord_1',
    short_id: 'DTH7CQFV',
    status: 'pending_acceptance',
    source: 'customer_pwa',
    customer_name: 'Juan Perez',
    customer_phone: '999888777',
    delivery_address: 'Av. San Martin 123',
    delivery_reference: 'Puerta verde',
    delivery_method: 'delivery',
    order_amount: 28,
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
    created_at: '2026-09-09T01:17:57Z',
    pending_acceptance_at: '2026-09-09T01:17:57Z',
    awaiting_payment_at: null,
    validating_at: null,
    waiting_driver_at: null,
    picked_up_at: null,
    ready_for_pickup_at: null,
    pickup_timing: null,
    tracking_link_sent_at: null,
    delivered_at: null,
    cancelled_at: null,
    cancel_note: null,
    cancel_reason: null,
    driver: null,
    ...overrides,
  }
}

const vm = (o: Partial<OrderRow> = {}) => toOrderVM(row(o), NOW, DEFAULT_ORDER_TIMERS)

/** Los tres de Pizza Priamo del 8 de septiembre, en el orden de la consulta
 *  (`created_at DESC`: el más reciente primero). */
const perdido = (shortId: string, creado: string, extra: Partial<OrderRow> = {}) =>
  vm({
    id: `ord_${shortId}`,
    short_id: shortId,
    status: 'cancelled',
    cancel_reason: 'pending_acceptance_timeout',
    created_at: creado,
    cancelled_at: creado,
    ...extra,
  })

const X9MV4TED = perdido('X9MV4TED', '2026-09-09T01:54:20Z')
const VHRTX2ML = perdido('VHRTX2ML', '2026-09-09T01:45:34Z')
const DTH7CQFV = perdido('DTH7CQFV', '2026-09-09T01:17:57Z')

describe('esVentaPerdida · culpa del mostrador, no del cliente', () => {
  it('lo que nadie aceptó a tiempo es una venta perdida', () => {
    expect(esVentaPerdida(DTH7CQFV)).toBe(true)
  })

  it('la captura del pago que nadie miró, también', () => {
    expect(esVentaPerdida(vm({ status: 'cancelled', cancel_reason: 'validation_timeout' }))).toBe(
      true,
    )
  })

  it('EL PREPAGO QUE EL CLIENTE NO PAGÓ, NO', () => {
    // Ahí el negocio aceptó y el reloj lo corría el cliente. Reprochárselo a la
    // cajera es enseñarle a ignorar el aviso, que es lo contrario de lo que se
    // busca. Ver la cabecera de `lost-sales.ts`.
    expect(esVentaPerdida(vm({ status: 'cancelled', cancel_reason: 'prepay_timeout' }))).toBe(false)
  })

  it('lo que canceló una persona no es un descuido', () => {
    for (const motivo of ['business_cancelled', 'admin_cancelled', 'customer_cancelled']) {
      expect(esVentaPerdida(vm({ status: 'cancelled', cancel_reason: motivo }))).toBe(false)
    }
  })

  it('un pedido entregado nunca es una venta perdida', () => {
    expect(esVentaPerdida(vm({ status: 'delivered' }))).toBe(false)
  })

  it('uno que sigue vivo no es una venta perdida: todavía se puede atender', () => {
    // El motivo puede estar puesto sin que el pedido esté cancelado (una fila a
    // medias, un mapeo futuro). Manda el estado.
    expect(
      esVentaPerdida({
        status: 'pending_acceptance',
        cancelReasonCode: 'pending_acceptance_timeout',
      }),
    ).toBe(false)
  })
})

describe('ventasPerdidasSinAvisar · el bucle que nadie cerraba', () => {
  const tablero = [X9MV4TED, VHRTX2ML, DTH7CQFV]

  it('LAS TRES DE AQUELLA NOCHE, si no se avisó de ninguna', () => {
    const pendientes = ventasPerdidasSinAvisar(tablero, new Set())
    expect(pendientes.map((o) => o.id)).toEqual(['DTH7CQFV', 'VHRTX2ML', 'X9MV4TED'])
  })

  it('las cuenta de la más antigua a la más reciente', () => {
    // La consulta las trae al revés (`created_at DESC`). Se enseñan en el orden
    // en que ocurrieron, que es como se cuenta lo que pasó.
    const pendientes = ventasPerdidasSinAvisar(tablero, new Set())
    expect(pendientes[0]?.id).toBe('DTH7CQFV')
  })

  it('no repite la que ya se enseñó', () => {
    const pendientes = ventasPerdidasSinAvisar(tablero, new Set(['ord_DTH7CQFV']))
    expect(pendientes.map((o) => o.id)).toEqual(['VHRTX2ML', 'X9MV4TED'])
  })

  it('avisadas todas, no queda nada que enseñar', () => {
    const todas = new Set(tablero.map((o) => o.rowId))
    expect(ventasPerdidasSinAvisar(tablero, todas)).toEqual([])
  })

  it('un tablero sin cancelaciones no interrumpe a nadie', () => {
    expect(ventasPerdidasSinAvisar([vm(), vm({ status: 'delivered' })], new Set())).toEqual([])
  })

  it('el que llega DESPUÉS de cerrar el aviso vuelve a interrumpir', () => {
    // El caso de aquella noche: se perdió uno, luego otro y luego otro. Dar por
    // visto el primero no puede callar al segundo, que es justo el que todavía
    // se podía evitar.
    const yaVisto = new Set([DTH7CQFV.rowId])
    expect(ventasPerdidasSinAvisar([VHRTX2ML, DTH7CQFV], yaVisto).map((o) => o.id)).toEqual([
      'VHRTX2ML',
    ])
  })
})

describe('lo que se dejó de vender', () => {
  it('suma los totales, que es la cifra que duele', () => {
    // 28 + 5 de reparto, tres veces: los S/99 de aquella noche eran del mismo
    // orden de magnitud.
    expect(totalPerdido([X9MV4TED, VHRTX2ML, DTH7CQFV])).toBe(99)
  })

  it('sin nada perdido, cero', () => {
    expect(totalPerdido([])).toBe(0)
  })
})

describe('tituloVentaPerdida · uno se nombra, varios se cuentan', () => {
  it('en singular', () => {
    expect(tituloVentaPerdida([DTH7CQFV])).toBe('Se escapó un pedido')
  })

  it('en plural dice cuántos: a partir de dos lo grave es que se repita', () => {
    expect(tituloVentaPerdida([DTH7CQFV, VHRTX2ML, X9MV4TED] as OrderVM[])).toBe(
      'Se escaparon 3 pedidos',
    )
  })
})
