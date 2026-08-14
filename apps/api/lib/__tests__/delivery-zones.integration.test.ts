/**
 * El pin decide lo que cuesta el envío (0161 + 0162).
 *
 * EL DEFECTO QUE ESTO AMARRA. `create_customer_order` cobraba
 * `delivery_bands->>'near'` LITERAL: el pedido del cliente pagaba S/ 2.00 caiga
 * el pin donde caiga, y `delivery_distance_band` no se escribía siquiera. Es el
 * mismo defecto que 0126 arregló para el pedido manual y que en el lado del
 * cliente nadie volvió a tocar.
 *
 * Las dos mitades que hay que sostener a la vez:
 *   · sin zonas dibujadas NADA cambia de precio — es lo que permite aplicar la
 *     0162 en producción sin mover un céntimo;
 *   · con una zona dibujada encima del pin, cobra la tarifa lejana.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'
const CUSTOMER_PHONE = '+51900000003'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

/** Verificadas dentro del polígono de cobertura (ver `e2e-fixtures.ts`). */
const PIN = { lat: -9.151, lng: -78.28 }

/** Un cuadrado que envuelve al pin, con margen de sobra. */
const ZONA_SOBRE_EL_PIN = [
  { lat: PIN.lat - 0.004, lng: PIN.lng - 0.004 },
  { lat: PIN.lat - 0.004, lng: PIN.lng + 0.004 },
  { lat: PIN.lat + 0.004, lng: PIN.lng + 0.004 },
  { lat: PIN.lat + 0.004, lng: PIN.lng - 0.004 },
]

const MARCA = 'zonas-integration'

async function tarifas(): Promise<{ near: number; far: number }> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'delivery_bands')
    .single()
  return data?.value as { near: number; far: number }
}

async function crearPedido() {
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: CUSTOMER_USER_ID,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    // Prepago: el primer pedido de un cliente lo exige. El método de pago no
    // entra en el cálculo del envío — ese solo mira `delivery_method`.
    p_payment_intent: 'prepaid',
    p_customer_name: 'Vecino de Zonas',
    p_customer_phone: CUSTOMER_PHONE,
    p_delivery_address: 'Jr. Prueba 1',
    p_delivery_reference: 'Zonas',
    p_delivery_lat: PIN.lat,
    p_delivery_lng: PIN.lng,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
  })
  if (error) throw new Error(`create_customer_order: ${error.message}`)
  const { data: row } = await db
    .from('orders')
    .select('delivery_fee,delivery_distance_band,delivery_fee_source')
    .eq('id', (data as { id: string }).id)
    .single()
  return row as {
    delivery_fee: number
    delivery_distance_band: string | null
    delivery_fee_source: string | null
  }
}

/**
 * El guard de "un pedido activo por cliente y negocio" haría fallar al SEGUNDO
 * caso por un motivo que no es el suyo. Cada uno arranca con el cliente libre.
 */
async function limpiarPedidosDelCliente() {
  const { data } = await db
    .from('orders')
    .select('id')
    .eq('customer_user_id', CUSTOMER_USER_ID)
    .not('status', 'in', '("delivered","cancelled")')
  for (const o of data ?? []) {
    await db.from('domain_events').delete().eq('aggregate_id', o.id)
    await db.from('customer_order_items').delete().eq('order_id', o.id)
    await db.from('orders').delete().eq('id', o.id)
  }
}

const limpiarZonas = () => db.from('delivery_zones').delete().eq('name', MARCA)

describe('el pin decide la banda del pedido del cliente', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
    await limpiarZonas()
    await limpiarPedidosDelCliente()
  })

  afterEach(limpiarPedidosDelCliente)
  afterAll(limpiarZonas)

  // LA MITAD QUE PERMITE DESPLEGAR SIN MIEDO. Si esto se rompe, aplicar la 0162
  // en producción cambiaría precios de golpe sin que nadie hubiera dibujado nada.
  it('sin zonas dibujadas cobra la tarifa cercana, como siempre', async () => {
    await limpiarZonas()
    const { near } = await tarifas()
    const o = await crearPedido()
    expect(Number(o.delivery_fee)).toBe(Number(near))
    expect(o.delivery_distance_band).toBe('near')
    // Y ahora SÍ se registra de dónde salió el precio; antes quedaba en NULL.
    expect(o.delivery_fee_source).toBe('system')
  })

  it('con una zona lejana encima del pin cobra la tarifa lejana', async () => {
    const { far, near } = await tarifas()
    expect(far).not.toBe(near) // si fueran iguales, el test no probaría nada
    const { error } = await db
      .from('delivery_zones')
      .insert({ name: MARCA, polygon: ZONA_SOBRE_EL_PIN })
    if (error) throw new Error(`insert zona: ${error.message}`)

    const o = await crearPedido()
    expect(Number(o.delivery_fee)).toBe(Number(far))
    expect(o.delivery_distance_band).toBe('far')
    expect(o.delivery_fee_source).toBe('system')
  })

  // Apagar una zona tiene que devolver el precio, no dejarlo pegado.
  it('una zona apagada deja de cobrar de más', async () => {
    const { near } = await tarifas()
    await db.from('delivery_zones').update({ active: false }).eq('name', MARCA)

    const o = await crearPedido()
    expect(Number(o.delivery_fee)).toBe(Number(near))
    expect(o.delivery_distance_band).toBe('near')
  })

  // El recojo no tiene banda: el cliente va al local. Escribir 'near' metería un
  // dato falso en los reportes (misma decisión que 0126).
  it('en recojo no hay banda ni envío', async () => {
    await db.from('delivery_zones').update({ active: true }).eq('name', MARCA)
    const { data, error } = await db.rpc('create_customer_order', {
      p_customer_user_id: CUSTOMER_USER_ID,
      p_business_id: BUSINESS_ID,
      p_delivery_method: 'pickup',
      p_payment_intent: 'prepaid',
      p_customer_name: 'Vecino de Zonas',
      p_customer_phone: CUSTOMER_PHONE,
      p_delivery_address: 'Recojo en tienda',
      p_delivery_reference: null,
      p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
      p_source: 'customer_pwa',
    })
    if (error) throw new Error(`create_customer_order: ${error.message}`)
    const { data: row } = await db
      .from('orders')
      .select('delivery_fee,delivery_distance_band,delivery_fee_source')
      .eq('id', (data as { id: string }).id)
      .single()
    expect(Number(row?.delivery_fee)).toBe(0)
    expect(row?.delivery_distance_band).toBeNull()
    expect(row?.delivery_fee_source).toBe('system')
  })
})

describe('delivery_band_for_point: la regla suelta', () => {
  afterAll(limpiarZonas)

  it('fuera de toda zona es near, aunque no haya ninguna dibujada', async () => {
    await limpiarZonas()
    const { data } = await db.rpc('delivery_band_for_point', { p_lat: PIN.lat, p_lng: PIN.lng })
    expect(data).toBe('near')
  })

  /** Sin coordenada no se puede decidir nada: cae al defecto, no revienta. */
  it('sin coordenadas cae a near en vez de fallar', async () => {
    const { data, error } = await db.rpc('delivery_band_for_point', { p_lat: null, p_lng: null })
    expect(error).toBeNull()
    expect(data).toBe('near')
  })

  // La cobertura y la banda son DOS preguntas distintas: esta función no mira la
  // primera, así que una zona lejana que se salga del contorno cobra de más pero
  // nunca rechaza la venta.
  it('no mira la cobertura: un punto lejísimos también responde', async () => {
    const { data, error } = await db.rpc('delivery_band_for_point', {
      p_lat: -12.0464,
      p_lng: -77.0428, // Lima
    })
    expect(error).toBeNull()
    expect(data).toBe('near')
  })
})
