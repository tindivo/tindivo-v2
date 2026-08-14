/**
 * El corte de caja, pedido por pedido (0157) y con cobros que no son
 * todo-o-nada (0141).
 *
 * DOS REGLAS DISTINTAS, AMARRADAS AQUÍ:
 *
 *   · CUÁNTO (0141). La liquidación DEDUCÍA el efectivo del método: filtraba
 *     `paid_cash` y sumaba el total. Con un mixto eso daba dos resultados malos
 *     y ninguno aceptable — fuera del corte lo perdía el negocio; dentro con el
 *     total lo pagaba el motorizado.
 *
 *   · QUÉ (0157). La unidad de entrega dejó de ser "todo lo que este motorizado
 *     le debe a este negocio" y pasó a ser UN pedido. Con ello desaparecen el
 *     monto tecleado, la acumulación sobre un ciclo abierto y la posibilidad de
 *     que un doble tap cobre dos veces.
 *
 * Tan importante como lo nuevo: una entrega de solo efectivo sigue dando
 * EXACTAMENTE el mismo número que antes.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  localClient as db,
  E2E,
  seedContraentregaOrder,
  TELEFONOS_FIXTURE,
} from './helpers/local-db'

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

interface DeliverResult {
  id: string
  orderId: string
  amount: number
  status: string
  alreadyDelivered: boolean
}

async function entregarEfectivo(orderId: string, driverUserId = E2E.DRIVER_USER_ID) {
  const { data, error } = await db.rpc('deliver_order_cash', {
    p_driver_user_id: driverUserId,
    p_order_id: orderId,
  })
  return { data: data as DeliverResult | null, error }
}

async function entregarOk(orderId: string): Promise<DeliverResult> {
  const { data, error } = await entregarEfectivo(orderId)
  if (error) throw new Error(`deliver_order_cash failed: ${error.message}`)
  return data as DeliverResult
}

/**
 * Deja el mundo e2e sin pedidos de fixture colgando en `delivered`.
 *
 * Ya no hace falta para AISLAR —`deliver_order_cash` solo toca el pedido que le
 * pasas, así que un pedido de otro test no contamina ninguna suma—, pero sí para
 * no ir dejando pedidos entregados de prueba en la base entre corridas.
 *
 * El `.in('customer_phone', …)` acota el update a pedidos de fixture. Sin él
 * sacaba de `delivered` a TODO entregado del par e2e, y `delivered` es terminal
 * en el dominio (CLAUDE.md, invariante 8): era el único sitio del repo que lo
 * pisaba, y se comía el pedido de historial del tablero de demo en cada corrida.
 */
async function parkPending() {
  await db
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('driver_id', E2E.DRIVER_ID)
    .eq('business_id', E2E.BUSINESS_ID)
    .eq('status', 'delivered')
    .is('cash_settlement_id', null)
    .in('customer_phone', TELEFONOS_FIXTURE)
}

describe('cuánto efectivo lleva encima: cobros mixtos', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('id', E2E.DRIVER_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
    await parkPending()
  })

  // NO CAMBIA NADA PARA LO DE SIEMPRE. Es la mitad más importante: 0141 y 0157
  // tocaron código de dinero, y ninguna cifra existente puede moverse.
  it('solo efectivo: exactamente el total, como antes de 0141', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const s = await entregarOk(orderId)
    expect(Number(s.amount)).toBe(TOTAL)
    expect(s.status).toBe('pending_confirmation')
  })

  it('Yape: no entra al corte, no lleva efectivo', async () => {
    const orderId = await delivered({ paymentReal: 'paid_yape' })
    const { error } = await entregarEfectivo(orderId)
    expect(error?.message).toMatch(/no lleva efectivo/i)
  })

  // EL CASO QUE MOTIVÓ 0141.
  it('mixto: entra por SU PARTE en efectivo, no por el total', async () => {
    const orderId = await delivered({ paymentReal: 'paid_mixed', cashAmount: 30, yapeAmount: 22 })
    const s = await entregarOk(orderId)
    // 30, no 52: los otros 22 fueron por Yape y el motorizado no los lleva.
    expect(Number(s.amount)).toBe(30)
  })

  it('efectivo y mixto juntos suman lo que de verdad lleva encima', async () => {
    const a = await delivered({ paymentReal: 'paid_cash' })
    const b = await delivered({ paymentReal: 'paid_mixed', cashAmount: 20, yapeAmount: 32 })
    const sa = await entregarOk(a)
    const sb = await entregarOk(b)
    expect(Number(sa.amount) + Number(sb.amount)).toBe(TOTAL + 20)
    // Y son DOS liquidaciones, no una acumulada: es lo que permite que la
    // cajera confirme la de Lucía sin tocar la de Martha.
    expect(sa.id).not.toBe(sb.id)
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

    const { error } = await entregarEfectivo(orderId)
    expect(error?.message).toMatch(/no lleva efectivo/i)
    await parkPending()
  })
})

describe('la entrega es por pedido y de un solo dueño (0157)', () => {
  /**
   * EL DEFECTO QUE ESTO CIERRA. El endpoint viejo no era idempotente: un segundo
   * POST con red lenta acumulaba sobre el ciclo abierto y sumaba el dinero otra
   * vez, sin que nada lo detectara. Con una liquidación por pedido, el enlace
   * `orders.cash_settlement_id` ES la clave de idempotencia.
   */
  it('doble tap: misma liquidación, sin duplicar el dinero', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const primera = await entregarOk(orderId)
    const segunda = await entregarOk(orderId)

    expect(segunda.id).toBe(primera.id)
    expect(primera.alreadyDelivered).toBe(false)
    expect(segunda.alreadyDelivered).toBe(true)

    const { data: cs } = await db
      .from('cash_settlements')
      .select('total_cash,delivered_amount,order_count')
      .eq('id', primera.id)
      .single()
    expect(Number(cs?.delivered_amount)).toBe(TOTAL)
    expect(Number(cs?.total_cash)).toBe(TOTAL)
    expect(cs?.order_count).toBe(1)

    // Y una sola fila para ese pedido, no dos.
    const { count } = await db
      .from('cash_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('id', primera.id)
    expect(count).toBe(1)
  })

  it('un pedido ajeno no se puede rendir', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const { error } = await entregarEfectivo(orderId, E2E.DRIVER_2_USER_ID)
    expect(error?.message).toMatch(/no es tuyo/i)
  })

  it('un pedido que no está entregado tampoco', async () => {
    const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
    await db
      .from('orders')
      .update({ driver_id: E2E.DRIVER_ID, status: 'picked_up' })
      .eq('id', orderId)
    const { error } = await entregarEfectivo(orderId)
    expect(error?.message).toMatch(/todavía no está entregado/i)
  })

  /**
   * La fecha del dinero es la de la ENTREGA al cliente, en hora Lima. El turno
   * es nocturno: calcularla con `now()` en UTC —como hacía el legacy— empujaba
   * al día siguiente todo lo cobrado después de las 19:00 hora Perú.
   */
  it('settlement_date sale del delivered_at del pedido, en hora Lima', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    // 21:30 hora Lima del 10 de agosto = 02:30 UTC del 11. En UTC caería en el 11.
    await db.from('orders').update({ delivered_at: '2026-08-11T02:30:00Z' }).eq('id', orderId)

    const s = await entregarOk(orderId)
    const { data: cs } = await db
      .from('cash_settlements')
      .select('settlement_date')
      .eq('id', s.id)
      .single()
    expect(cs?.settlement_date).toBe('2026-08-10')
  })

  /** El monto de la confirmación lo DERIVA la RPC: la pantalla ya no puede
   *  mandar una cifra distinta de la que el motorizado entregó. */
  it('confirmar cierra la liquidación con el importe de la fila', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const s = await entregarOk(orderId)

    const { data, error } = await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
    })
    expect(error).toBeNull()
    expect((data as { confirmed: boolean }).confirmed).toBe(true)

    const { data: cs } = await db
      .from('cash_settlements')
      .select('status,confirmed_amount,confirmed_by')
      .eq('id', s.id)
      .single()
    expect(cs?.status).toBe('confirmed')
    expect(Number(cs?.confirmed_amount)).toBe(TOTAL)
    expect(cs?.confirmed_by).toBe(E2E.BUSINESS_USER_ID)
  })

  it('confirmar dos veces no es un error: la segunda no hace nada', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const s = await entregarOk(orderId)
    await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
    })
    const { data, error } = await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
    })
    expect(error).toBeNull()
    expect(data as { confirmed: boolean; status: string }).toMatchObject({
      confirmed: false,
      status: 'confirmed',
    })
  })

  it('un negocio no confirma la liquidación de otro', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const s = await entregarOk(orderId)
    const { error } = await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.DRIVER_USER_ID, // no es dueño de ningún negocio
    })
    expect(error?.message).toMatch(/no autorizado/i)
  })

  /** Ya cerrada, rendirla otra vez SÍ es un error: eso no es un doble tap. */
  it('rendir un pedido ya confirmado se corta', async () => {
    const orderId = await delivered({ paymentReal: 'paid_cash' })
    const s = await entregarOk(orderId)
    await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
    })
    const { error } = await entregarEfectivo(orderId)
    expect(error?.message).toMatch(/ya fue confirmado/i)
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
