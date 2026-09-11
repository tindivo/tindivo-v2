/**
 * Envío gratis por plato (0227): "4 Alitas Crispy" (Al Punto), martes y jueves.
 *
 * A diferencia de la promo de lanzamiento (0187), esta es ILIMITADA a propósito
 * —sin tope, sin ledger de redenciones—, así que lo único que hay que amarrar es:
 *
 *   · SOLO SI EL CARRITO ES ÚNICAMENTE EL PLATO PROMOCIONADO. Con otra cosa en
 *     el carrito, se cobra el envío completo.
 *   · SOLO CANAL `customer_pwa`. El 88% de los pedidos los teclea la cajera
 *     (`business_manual`), y esta promo la financia Tindivo — no se regala sola
 *     en un pedido telefónico.
 *   · FAIL-CLOSED: un plato sin `free_delivery_days`, o con el array vacío,
 *     nunca regala el envío, ni por accidente.
 *
 * EL DÍA NO SE PRUEBA CONTRA "HOY". Los casos de composición de carrito y canal
 * usan un plato con `free_delivery_days` cubriendo los 7 días (0-6) —igual que
 * `promoViva()` en la suite de la 0187 usa una ventana 2000-2099— para que el
 * resultado no dependa de qué día real corra la suite. El cálculo del día en sí
 * (la frontera de la jornada a las 05:00 Lima) se prueba aparte, llamando
 * directo a la función pura `menu_item_free_delivery_day` con timestamps de
 * mano: martes 2026-09-08 y jueves 2026-09-10 son reales (verificados), así que
 * sirven de ancla sin depender del reloj de la máquina que corre el test.
 *
 * MUNDO PROPIO: dos platos nuevos bajo el negocio del seed, borrados al final.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db, E2E } from './helpers/local-db'

const PIN = { lat: -9.151, lng: -78.28 }
const PREFIJO_TEL = '+51997'
const NOMBRE_FIXTURE = 'Vecino Alitas'
const TODOS_LOS_DIAS: number[] = [0, 1, 2, 3, 4, 5, 6]

let categoryId = ''
let itemPromoId = ''
let itemNormalId = ''
let itemSinDiasId = ''
let itemDiasVaciosId = ''
let tarifaNear = 2.0

const clientesCreados: string[] = []
const pedidosCreados: string[] = []

interface Cliente {
  userId: string
  phone: string
}

let contador = 0
async function nuevoCliente(): Promise<Cliente> {
  contador += 1
  const phone = `${PREFIJO_TEL}${String(100000 + contador).slice(-6)}`

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: `alitas-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_FIXTURE },
  })
  if (authErr) throw new Error(`crear cliente falló: ${authErr.message}`)
  const userId = authUser.user.id

  const { error: perfErr } = await db.from('customer_profiles').insert({
    user_id: userId,
    full_name: NOMBRE_FIXTURE,
    phone,
    phone_verified_at: new Date().toISOString(),
  })
  if (perfErr) throw new Error(`crear perfil falló: ${perfErr.message}`)

  clientesCreados.push(userId)
  return { userId, phone }
}

interface ResultadoPedido {
  id: string
  deliveryFee: number
  total: number
}

async function pedir(
  cliente: Cliente,
  items: Array<{ menu_item_id: string; quantity?: number }>,
  opts: { metodo?: 'delivery' | 'pickup'; source?: 'customer_pwa' | 'business_manual' } = {},
): Promise<ResultadoPedido> {
  const metodo = opts.metodo ?? 'delivery'
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: cliente.userId,
    p_business_id: E2E.BUSINESS_ID,
    p_delivery_method: metodo,
    // Prepago: estos clientes nacen sin historial, y la contraentrega sin
    // historial exige GPS o "recojo ahora". El método de pago no entra en el
    // cálculo del envío por plato.
    p_payment_intent: 'prepaid',
    p_customer_name: NOMBRE_FIXTURE,
    p_customer_phone: cliente.phone,
    p_delivery_address: metodo === 'delivery' ? 'Jr. Alitas 1' : '',
    p_delivery_reference: metodo === 'delivery' ? 'Alitas' : '',
    p_delivery_lat: metodo === 'delivery' ? PIN.lat : null,
    p_delivery_lng: metodo === 'delivery' ? PIN.lng : null,
    p_items: items.map((i) => ({
      menu_item_id: i.menu_item_id,
      quantity: i.quantity ?? 1,
      modifiers: [],
    })),
    p_source: opts.source ?? 'customer_pwa',
  })
  if (error) throw new Error(`create_customer_order: ${error.message}`)
  const r = data as { id: string; deliveryFee: number; total: number }
  pedidosCreados.push(r.id)
  return { id: r.id, deliveryFee: Number(r.deliveryFee), total: Number(r.total) }
}

async function feeSource(orderId: string): Promise<string | null> {
  const { data, error } = await db
    .from('orders')
    .select('delivery_fee_source')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`leer delivery_fee_source falló: ${error.message}`)
  return data.delivery_fee_source
}

async function borrarPedido(orderId: string): Promise<void> {
  await db.from('domain_events').delete().eq('aggregate_id', orderId)
  await db.from('order_event_log').delete().eq('order_id', orderId)
  await db.from('customer_order_items').delete().eq('order_id', orderId)
  await db.from('orders').delete().eq('id', orderId)
}

beforeAll(async () => {
  const { data: cat, error: catErr } = await db
    .from('menu_categories')
    .select('id')
    .eq('business_id', E2E.BUSINESS_ID)
    .limit(1)
    .single()
  if (catErr) throw new Error(`no encontré categoría del seed: ${catErr.message}`)
  categoryId = cat.id

  const { data: bandas } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'delivery_bands')
    .single()
  tarifaNear = Number((bandas?.value as Record<string, unknown> | null)?.near ?? 2.0)

  async function crearItem(name: string, freeDeliveryDays: number[] | null): Promise<string> {
    const { data, error } = await db
      .from('menu_items')
      .insert({
        business_id: E2E.BUSINESS_ID,
        category_id: categoryId,
        name,
        base_price: 13.9,
        is_available: true,
        free_delivery_days: freeDeliveryDays,
      })
      .select('id')
      .single()
    if (error) throw new Error(`crear item "${name}" falló: ${error.message}`)
    return data.id
  }

  itemPromoId = await crearItem('Alitas promo (test)', TODOS_LOS_DIAS)
  itemNormalId = await crearItem('Plato normal (test)', null)
  itemSinDiasId = await crearItem('Alitas sin flag (test)', null)
  itemDiasVaciosId = await crearItem('Alitas dias vacios (test)', [])
})

afterAll(async () => {
  for (const id of pedidosCreados) await borrarPedido(id)
  for (const id of [itemPromoId, itemNormalId, itemSinDiasId, itemDiasVaciosId]) {
    if (id) await db.from('menu_items').delete().eq('id', id)
  }
  for (const userId of clientesCreados) {
    await db.from('customer_profiles').delete().eq('user_id', userId)
    await db.auth.admin.deleteUser(userId)
  }
})

describe('envío gratis por plato (0227)', () => {
  it('carrito de SOLO el plato promocionado, canal cliente: envío gratis', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [{ menu_item_id: itemPromoId, quantity: 2 }])
    expect(r.deliveryFee).toBe(0)
    expect(await feeSource(r.id)).toBe('promo')
  })

  it('carrito mixto (plato promo + otro plato): cobra el envío completo', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [
      { menu_item_id: itemPromoId, quantity: 1 },
      { menu_item_id: itemNormalId, quantity: 1 },
    ])
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(await feeSource(r.id)).not.toBe('promo')
  })

  it('mismo carrito de solo el plato promo, pero por canal business_manual: cobra normal', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [{ menu_item_id: itemPromoId, quantity: 1 }], {
      source: 'business_manual',
    })
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(await feeSource(r.id)).not.toBe('promo')
  })

  it('pickup del plato promo: envío ya era 0, y NO se marca como promo', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [{ menu_item_id: itemPromoId, quantity: 1 }], {
      metodo: 'pickup',
    })
    expect(r.deliveryFee).toBe(0)
    expect(await feeSource(r.id)).not.toBe('promo')
  })

  it('plato sin free_delivery_days (NULL): cobra normal — fail-closed', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [{ menu_item_id: itemSinDiasId, quantity: 1 }])
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(await feeSource(r.id)).not.toBe('promo')
  })

  it('plato con free_delivery_days vacío ({}): cobra normal — fail-closed', async () => {
    const cliente = await nuevoCliente()
    const r = await pedir(cliente, [{ menu_item_id: itemDiasVaciosId, quantity: 1 }])
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(await feeSource(r.id)).not.toBe('promo')
  })
})

describe('menu_item_free_delivery_day: la frontera del día (0227)', () => {
  // 2026-09-08 es martes y 2026-09-10 es jueves (verificados). 0=lunes..6=domingo,
  // así que martes=1 y jueves=3.
  const DIAS = [1, 3]

  async function esDiaPromo(iso: string): Promise<boolean> {
    const { data, error } = await db.rpc('menu_item_free_delivery_day', {
      p_free_delivery_days: DIAS,
      p_at: iso,
    })
    if (error) throw new Error(`menu_item_free_delivery_day: ${error.message}`)
    return data as boolean
  }

  it('martes 20:00 Lima: sí', async () => {
    expect(await esDiaPromo('2026-09-08T20:00:00-05:00')).toBe(true)
  })

  it('jueves 20:00 Lima: sí', async () => {
    expect(await esDiaPromo('2026-09-10T20:00:00-05:00')).toBe(true)
  })

  it('miércoles 20:00 Lima: no', async () => {
    expect(await esDiaPromo('2026-09-09T20:00:00-05:00')).toBe(false)
  })

  it('miércoles 02:00 Lima (madrugada, jornada aún del martes): sí', async () => {
    expect(await esDiaPromo('2026-09-09T02:00:00-05:00')).toBe(true)
  })

  it('martes 02:00 Lima (madrugada, jornada aún del lunes): no', async () => {
    expect(await esDiaPromo('2026-09-08T02:00:00-05:00')).toBe(false)
  })

  it('sin días configurados (NULL): no, nunca', async () => {
    const { data, error } = await db.rpc('menu_item_free_delivery_day', {
      p_free_delivery_days: null,
      p_at: '2026-09-08T20:00:00-05:00',
    })
    if (error) throw new Error(`menu_item_free_delivery_day: ${error.message}`)
    expect(data).toBe(false)
  })

  it('array de días vacío: no, nunca', async () => {
    const { data, error } = await db.rpc('menu_item_free_delivery_day', {
      p_free_delivery_days: [],
      p_at: '2026-09-08T20:00:00-05:00',
    })
    if (error) throw new Error(`menu_item_free_delivery_day: ${error.message}`)
    expect(data).toBe(false)
  })
})
