/**
 * El adelanto de vuelto vuelve a la caja (0146).
 *
 * EL HECHO DEL QUE CUELGA TODO: el sencillo lo pone SIEMPRE la cajera. Se lo da
 * al motorizado antes de que salga, así que es dinero del negocio en su bolsillo
 * desde ese momento y se rinde pague el cliente como pague.
 *
 *   rendir = adelanto + parte en efectivo del pedido
 *
 * Hasta 0146 el adelanto no se modelaba y se perdía en tres de los cuatro
 * caminos, incluido el más común (cliente que paga con billete). Lo que estos
 * tests amarran es `cash_owed_at_delivery` con adelanto en juego; los de
 * `deliver-payment.integration.test.ts` cubren el mismo RPC SIN adelanto, y
 * siguen valiendo tal cual: son la garantía de que un pedido sin vuelto no se
 * mueve ni un céntimo.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { localClient as db, E2E, seedContraentregaOrder } from './helpers/local-db'

/** Deja un pedido de contraentrega en `picked_up`, listo para entregar. */
async function pickedUpOrder(overrides: Record<string, unknown> = {}) {
  const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
  await db
    .from('orders')
    .update({
      driver_id: E2E.DRIVER_ID,
      status: 'picked_up',
      picked_up_at: new Date().toISOString(),
      ...overrides,
    })
    .eq('id', orderId)
  return orderId
}

async function deliver(orderId: string, params: Record<string, unknown>) {
  return db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: E2E.DRIVER_USER_ID,
    p_actor_role: 'driver',
    p_action: 'deliver',
    p_params: params,
  })
}

/**
 * `database.types.ts` se genera contra el REMOTO y `change_advanced` entra ahí
 * con el `db push`. El cast es para poder leerla mientras tanto, no para
 * saltarse el tipado: el resto del archivo usa el cliente tipado.
 */
async function read(orderId: string): Promise<Record<string, unknown> | null> {
  const { data } = await db.from('orders').select('*').eq('id', orderId).single()
  return data as Record<string, unknown> | null
}

// El seeder crea 50 + 2 de envío.
const TOTAL = 52
// Pedido de 52 que el cliente dijo pagar con 60: la caja adelanta 8.
const PAYS_WITH = 60
const ADVANCE = 8

/** Plan con adelanto: lo que la cajera dejó escrito al crear el pedido. */
const conAdelanto = {
  payment_intent: 'pending_cash',
  client_pays_with: PAYS_WITH,
  change_to_give: ADVANCE,
}

describe('el adelanto de vuelto vuelve a la caja', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('id', E2E.DRIVER_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  })

  // EL CASO MÁS COMÚN, Y EL QUE FUGABA. El motorizado se queda el billete de 60
  // y le devuelve al cliente los 8 que le adelantó la caja: debe los 60, no los
  // 52 del pedido. Antes de 0146 se le pedían 52 y los 8 se quedaban con él.
  it('paga con billete: debe el billete entero, no el total del pedido', async () => {
    const id = await pickedUpOrder(conAdelanto)
    const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: PAYS_WITH })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL + ADVANCE)
    expect(Number(o?.change_advanced)).toBe(ADVANCE)
    // El vuelto que de verdad le dio al cliente.
    expect(Number(o?.change_to_give)).toBe(ADVANCE)
  })

  // Mismo dinero encima que el caso anterior, por otro camino: aquí no gastó el
  // adelanto. Por eso "pagó exacto" NO necesita viajar como dato aparte.
  it('paga exacto: se queda el adelanto y lo debe igual', async () => {
    const id = await pickedUpOrder(conAdelanto)
    // Lo que manda hoy la hoja de entrega en el camino "Pagó exacto".
    const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: TOTAL })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL + ADVANCE)
    expect(Number(o?.change_advanced)).toBe(ADVANCE)
    expect(Number(o?.change_to_give)).toBe(0)
  })

  // REGRESIÓN QUE 0146 TENÍA QUE EVITAR: la validación del billete comparaba
  // contra `cash_owed`, que ahora incluye el adelanto. Con esa comparación este
  // camino —el más frecuente después del normal— habría empezado a fallar
  // pidiendo que el cliente cubriera un sencillo que ni vio.
  it('pagar exacto no lo rechaza la validación del billete', async () => {
    const id = await pickedUpOrder(conAdelanto)
    const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: TOTAL })
    expect(error).toBeNull()
    expect((await read(id))?.status).toBe('delivered')
  })

  it('cambia a Yape: no cobra nada al cliente pero sigue debiendo el adelanto', async () => {
    const id = await pickedUpOrder(conAdelanto)
    const { error } = await deliver(id, { paymentReal: 'paid_yape' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(ADVANCE)
    expect(Number(o?.change_advanced)).toBe(ADVANCE)
    // El plan de la cajera NO se pisa: es contra lo que se compara la realidad.
    expect(Number(o?.client_pays_with)).toBe(PAYS_WITH)
  })

  it('mixto: el adelanto se suma a la parte en efectivo', async () => {
    const id = await pickedUpOrder({
      payment_intent: 'pending_mixed',
      cash_amount: 20,
      yape_amount: 32,
      client_pays_with: 30, // paga la parte en efectivo con 30 -> adelanto 10
      change_to_give: 10,
    })
    const { error } = await deliver(id, {
      paymentReal: 'paid_mixed',
      cashAmount: 20,
      yapeAmount: 32,
      clientPaysWith: 30,
    })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(30) // 10 de adelanto + 20 en efectivo
    expect(Number(o?.change_advanced)).toBe(10)
  })

  // EL QUE AMARRA QUE NADA SE MUEVA. Sin vuelto que dar no hay adelanto, y el
  // importe es exactamente el de antes de 0146.
  it('sin adelanto, el importe es el de siempre', async () => {
    const id = await pickedUpOrder()
    const { error } = await deliver(id, { paymentReal: 'paid_cash' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL)
    expect(Number(o?.change_advanced)).toBe(0)
  })

  // Los pedidos manuales creados entre 0092 y 0131 tienen `change_to_give` en
  // NULL aunque hubiera vuelto. Para ellos el adelanto se deriva del billete.
  it('filas sin change_to_give: el adelanto se deriva del billete declarado', async () => {
    const id = await pickedUpOrder({
      payment_intent: 'pending_cash',
      client_pays_with: PAYS_WITH,
      change_to_give: null,
    })
    const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: PAYS_WITH })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.change_advanced)).toBe(ADVANCE)
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL + ADVANCE)
  })

  // Un prepago se paga antes de que el motorizado salga, así que la caja no le
  // adelanta nada. La fila de `paid_prepaid` de la tabla del spec solo se
  // alcanza forzando el método sobre un pedido que SÍ tenía plan en efectivo.
  it('un prepago nunca lleva adelanto', async () => {
    const id = await pickedUpOrder({ payment_intent: 'prepaid', client_pays_with: PAYS_WITH })
    const { error } = await deliver(id, { paymentReal: 'paid_cash' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(o?.payment_real).toBe('paid_prepaid')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
    expect(Number(o?.change_advanced)).toBe(0)
  })
})
