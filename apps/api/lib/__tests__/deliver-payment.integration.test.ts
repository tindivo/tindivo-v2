/**
 * El cobro REAL de la entrega (0140).
 *
 * El cliente cambia de idea en la puerta, y hasta 0140 lo único que se
 * guardaba era el método. El caso que rompía de verdad era el mixto pagado tal
 * cual el plan: la hoja obligaba a elegir todo-efectivo o todo-Yape y las dos
 * mentían, así que el corte de caja salía mal por la otra parte.
 *
 * Lo que estos tests amarran es `cash_owed_at_delivery`: cuánto efectivo se
 * lleva el motorizado por ese pedido. Es la columna que a partir de 0141 suma
 * la liquidación, y por tanto la que decide quién paga el descuadre.
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

async function read(orderId: string) {
  const { data } = await db
    .from('orders')
    .select(
      'payment_real,cash_owed_at_delivery,cash_amount,yape_amount,client_pays_with,change_to_give',
    )
    .eq('id', orderId)
    .single()
  return data
}

// El seeder crea 50 + 2 de envío.
const TOTAL = 52

describe('cobro real al entregar', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('id', E2E.DRIVER_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  })

  it('efectivo: el motorizado se lleva el total', async () => {
    const id = await pickedUpOrder()
    const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: 100 })
    expect(error).toBeNull()

    const o = await read(id)
    expect(o?.payment_real).toBe('paid_cash')
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL)
    expect(Number(o?.change_to_give)).toBe(100 - TOTAL)
  })

  // EL CASO QUE MOTIVÓ TODO. Antes había que elegir una mentira.
  it('mixto: solo debe la parte en efectivo, no el total', async () => {
    const id = await pickedUpOrder()
    const { error } = await deliver(id, {
      paymentReal: 'paid_mixed',
      cashAmount: 30,
      yapeAmount: 22,
      clientPaysWith: 50,
    })
    expect(error).toBeNull()

    const o = await read(id)
    expect(o?.payment_real).toBe('paid_mixed')
    expect(Number(o?.cash_owed_at_delivery)).toBe(30)
    expect(Number(o?.cash_amount)).toBe(30)
    expect(Number(o?.yape_amount)).toBe(22)
    expect(Number(o?.change_to_give)).toBe(20)
  })

  it('yape: no se lleva nada, aunque el pedido fuera de efectivo', async () => {
    const id = await pickedUpOrder()
    const { error } = await deliver(id, { paymentReal: 'paid_yape' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(o?.payment_real).toBe('paid_yape')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
  })

  it('un prepago no se re-cobra, mande lo que mande el cliente', async () => {
    const id = await pickedUpOrder({ payment_intent: 'prepaid' })
    // Aunque se pida efectivo, el método no es del motorizado.
    const { error } = await deliver(id, { paymentReal: 'paid_cash' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(o?.payment_real).toBe('paid_prepaid')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
  })

  it('sin división, un mixto usa la que planeó la cajera', async () => {
    const id = await pickedUpOrder({
      payment_intent: 'pending_mixed',
      cash_amount: 12,
      yape_amount: 40,
    })
    const { error } = await deliver(id, { paymentReal: 'paid_mixed' })
    expect(error).toBeNull()

    const o = await read(id)
    expect(Number(o?.cash_owed_at_delivery)).toBe(12)
  })

  describe('la validación vive en el servidor, no en la pantalla', () => {
    it('rechaza una división que no suma el pedido', async () => {
      const id = await pickedUpOrder()
      const { error } = await deliver(id, {
        paymentReal: 'paid_mixed',
        cashAmount: 10,
        yapeAmount: 10, // 20 ≠ 52
      })
      expect(error?.message).toMatch(/suman/i)

      // Y NO avanza: un cobro inválido no puede dejar el pedido entregado.
      const o = await read(id)
      expect(o?.payment_real).toBeNull()
    })

    it('rechaza un mixto con una parte en cero', async () => {
      const id = await pickedUpOrder()
      const { error } = await deliver(id, {
        paymentReal: 'paid_mixed',
        cashAmount: 52,
        yapeAmount: 0,
      })
      expect(error?.message).toMatch(/mayores que cero/i)
    })

    it('rechaza un mixto sin división por ningún lado', async () => {
      const id = await pickedUpOrder({ payment_intent: 'pending_mixed' })
      const { error } = await deliver(id, { paymentReal: 'paid_mixed' })
      expect(error?.message).toMatch(/las dos partes/i)
    })

    it('rechaza un billete que no cubre el efectivo', async () => {
      const id = await pickedUpOrder()
      const { error } = await deliver(id, { paymentReal: 'paid_cash', clientPaysWith: 20 })
      expect(error?.message).toMatch(/no cubre/i)
    })
  })
})
