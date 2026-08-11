/**
 * El corte de caja con cobros que no son todo-o-nada (0141).
 *
 * La liquidación DEDUCÍA el efectivo del método: filtraba `paid_cash` y sumaba
 * el total. Con un mixto eso daba dos resultados malos y ninguno aceptable —
 * fuera del corte lo perdía el negocio; dentro con el total lo pagaba el
 * motorizado. Por eso la hoja de entrega ni siquiera ofrecía la opción.
 *
 * Estos tests amarran las dos mitades: que el mixto entre por SU PARTE, y —tan
 * importante como eso— que una liquidación de solo efectivo siga dando
 * EXACTAMENTE el mismo número que antes.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { localClient as db, E2E, seedContraentregaOrder } from './helpers/local-db'

/** El seeder crea 50 + 2 de envío. */
const TOTAL = 52

async function delivered(payment: Record<string, unknown>) {
  const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
  await db
    .from('orders')
    .update({ driver_id: E2E.DRIVER_ID, status: 'picked_up' })
    .eq('id', orderId)

  const { error } = await db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: E2E.DRIVER_USER_ID,
    p_actor_role: 'driver',
    p_action: 'deliver',
    p_params: payment,
  })
  if (error) throw new Error(`deliver failed: ${error.message}`)
  return orderId
}

/**
 * Aísla cada caso: la rendición barre TODO lo pendiente del par
 * motorizado-negocio, así que un pedido de otro test contaminaría la suma.
 */
async function parkPending() {
  await db
    .from('orders')
    .update({ cash_settlement_id: null })
    .eq('driver_id', E2E.DRIVER_ID)
    .eq('business_id', E2E.BUSINESS_ID)
    .is('cash_settlement_id', null)
    .eq('status', 'delivered')
  // Se marcan como ya rendidos con un ciclo ficticio no: se les quita el
  // estado `delivered` para que no entren, y se restaura nada — son de prueba.
  await db
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('driver_id', E2E.DRIVER_ID)
    .eq('business_id', E2E.BUSINESS_ID)
    .eq('status', 'delivered')
    .is('cash_settlement_id', null)
}

async function settle() {
  const { data, error } = await db.rpc('create_cash_settlement', {
    p_driver_user_id: E2E.DRIVER_USER_ID,
    p_business_id: E2E.BUSINESS_ID,
    p_settlement_date: new Date().toISOString().slice(0, 10),
  })
  if (error) throw new Error(`settle failed: ${error.message}`)
  return data as { expected: number; orderCount: number }
}

describe('corte de caja con cobros mixtos', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('id', E2E.DRIVER_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
    await parkPending()
  })

  // NO CAMBIA NADA PARA LO DE SIEMPRE. Es la mitad más importante: 0141 tocó
  // codigo de dinero, y ninguna liquidacion existente puede moverse de numero.
  it('solo efectivo: exactamente el total, como antes de 0141', async () => {
    await delivered({ paymentReal: 'paid_cash' })
    const s = await settle()
    expect(s.orderCount).toBe(1)
    expect(Number(s.expected)).toBe(TOTAL)
    await parkPending()
  })

  it('Yape: no entra al corte, no lleva efectivo', async () => {
    await delivered({ paymentReal: 'paid_yape' })
    const { error } = await db.rpc('create_cash_settlement', {
      p_driver_user_id: E2E.DRIVER_USER_ID,
      p_business_id: E2E.BUSINESS_ID,
      p_settlement_date: new Date().toISOString().slice(0, 10),
    })
    expect(error?.message).toMatch(/no hay pedidos en efectivo/i)
    await parkPending()
  })

  // EL CASO QUE MOTIVÓ TODO.
  it('mixto: entra por SU PARTE en efectivo, no por el total', async () => {
    await delivered({ paymentReal: 'paid_mixed', cashAmount: 30, yapeAmount: 22 })
    const s = await settle()
    expect(s.orderCount).toBe(1)
    // 30, no 52: los otros 22 fueron por Yape y el motorizado no los lleva.
    expect(Number(s.expected)).toBe(30)
    await parkPending()
  })

  it('efectivo y mixto juntos suman lo que de verdad lleva encima', async () => {
    await delivered({ paymentReal: 'paid_cash' })
    await delivered({ paymentReal: 'paid_mixed', cashAmount: 20, yapeAmount: 32 })
    const s = await settle()
    expect(s.orderCount).toBe(2)
    expect(Number(s.expected)).toBe(TOTAL + 20)
    await parkPending()
  })

  it('un prepago entregado nunca entra al corte', async () => {
    const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
    await db
      .from('orders')
      .update({ driver_id: E2E.DRIVER_ID, status: 'picked_up', payment_intent: 'prepaid' })
      .eq('id', orderId)
    await db.rpc('advance_order', {
      p_order_id: orderId,
      p_actor_user_id: E2E.DRIVER_USER_ID,
      p_actor_role: 'driver',
      p_action: 'deliver',
      p_params: { paymentReal: 'paid_cash' },
    })

    const { error } = await db.rpc('create_cash_settlement', {
      p_driver_user_id: E2E.DRIVER_USER_ID,
      p_business_id: E2E.BUSINESS_ID,
      p_settlement_date: new Date().toISOString().slice(0, 10),
    })
    expect(error?.message).toMatch(/no hay pedidos en efectivo/i)
    await parkPending()
  })
})

describe('order_cash_owed: la regla, en un solo sitio', () => {
  // El `coalesce` de la funcion cubre las filas anteriores a 0140, que el
  // backfill deja rellenas pero que podrian aparecer en una base restaurada.
  it('sin la columna, cae a la regla vieja', async () => {
    const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
    await db
      .from('orders')
      .update({
        status: 'delivered',
        payment_real: 'paid_cash',
        cash_owed_at_delivery: null, // fila "antigua"
      })
      .eq('id', orderId)

    const { data } = await db
      .from('orders')
      .select('id,payment_real,order_amount,delivery_fee,cash_owed_at_delivery')
      .eq('id', orderId)
      .single()

    // La funcion vive en SQL; aqui se comprueba la premisa que la hace
    // necesaria: la fila existe con la columna vacia.
    expect(data?.cash_owed_at_delivery).toBeNull()
    expect(Number(data?.order_amount) + Number(data?.delivery_fee)).toBe(TOTAL)

    await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
  })
})
