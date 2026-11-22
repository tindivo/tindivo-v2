/**
 * Sin GPS (permiso negado o sin señal), la compra previa sigue pudiendo pagar al recibir.
 *
 * El checkout web manda `{ method: 'failed' }` SIN coordenadas cuando leer el GPS falla y el
 * cliente tiene compra previa (`apps/customer/features/checkout/lib/gps-failure.ts`). Estos
 * tests fijan lo que el servidor hace con ese pedido (`create_customer_order`, 0230).
 *
 * Se prueba la RPC y no la route: la route solo corta `risk_blocked` (403) y delega todo lo
 * demás a la RPC, cuyo `raise` viaja como 422 con el mismo texto (`customer/orders/route.ts`).
 * Clientes propios con teléfono único: `delivered` es terminal y el seed e2e acumula historial.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'
const LAT = -9.151
const LNG = -78.28

const clientes: { id: string; tel9: string }[] = []
const pedidos: string[] = []

async function crearCliente() {
  let tel9 = '9'
  for (let i = 0; i < 8; i++) tel9 += Math.floor(Math.random() * 10)
  const { data: auth, error } = await db.auth.admin.createUser({
    email: `sin-gps-${tel9}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Sin GPS' },
  })
  if (error) throw new Error(error.message)
  const c = { id: auth.user.id, tel9 }
  const { error: pErr } = await db.from('customer_profiles').insert({
    user_id: c.id,
    full_name: 'Vecino Sin GPS',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (pErr) throw new Error(pErr.message)
  clientes.push(c)
  return c
}

async function sembrarEntrega(tel9: string) {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: BUSINESS_ID,
      source: 'business_manual',
      status: 'delivered',
      delivery_method: 'delivery',
      payment_intent: 'pending_cash',
      customer_name: 'Vecino de siempre',
      customer_phone: tel9,
      order_amount: 20,
      delivery_fee: 2,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  pedidos.push(data.id)
}

/** Delivery, efectivo, `failed` y sin coordenadas de GPS: lo que manda el checkout. */
function pedir(
  c: { id: string; tel9: string },
  gps: Record<string, unknown> = { p_customer_gps_method: 'failed' },
) {
  return db.rpc('create_customer_order', {
    p_customer_user_id: c.id,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'pending_cash',
    p_customer_name: 'Vecino',
    p_customer_phone: c.tel9,
    p_delivery_address: 'Jr. Los Pinos 123',
    p_delivery_reference: 'Portón azul, frente al parque',
    p_delivery_lat: LAT,
    p_delivery_lng: LNG,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_client_pays_with: 50,
    ...gps,
  })
}

describe('contraentrega sin GPS (`failed` sin coordenadas)', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  })

  afterEach(async () => {
    for (const id of pedidos.splice(0)) {
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('order_event_log').delete().eq('order_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
  })

  afterAll(async () => {
    for (const c of clientes.splice(0)) {
      await db.from('customer_profiles').delete().eq('user_id', c.id)
      await db.from('users').delete().eq('id', c.id)
      await db.auth.admin.deleteUser(c.id)
    }
  })

  it('con compra previa: el pedido SE CREA y queda pending_acceptance, marcado gpsFallbackPrepaid', async () => {
    const c = await crearCliente()
    await sembrarEntrega(c.tel9)

    const { data, error } = await pedir(c)

    expect(error, `debería entrar: ${error?.message}`).toBeNull()
    const id = (data as { id: string }).id
    pedidos.push(id)
    const { data: fila } = await db
      .from('orders')
      .select('status, requires_validation, risk_flags, customer_gps_lat, customer_gps_method')
      .eq('id', id)
      .single()
    // 0230:648-660: contraentrega pasa a `validando` solo por las reglas generales (sin otro
    // pedido del teléfono, strikes o monto >= umbral). Aquí hay entrega previa del mismo
    // teléfono, sin strikes y S/ < 80: ninguna aplica, así que no hay llamada.
    expect(fila?.status).toBe('pending_acceptance')
    expect(fila?.requires_validation).toBe(false)
    // 0230:302-303: `failed` solo deja el flag, no rechaza.
    expect(fila?.risk_flags).toMatchObject({ gpsFallbackPrepaid: true })
    expect(fila?.customer_gps_lat).toBeNull()
    expect(fila?.customer_gps_method).toBe('failed')
  })

  it('sin compra previa: falla con «Pago adelantado requerido»', async () => {
    const c = await crearCliente()

    const { error } = await pedir(c)

    // 0230:266-271: `no_history` y `customer_gps_in_coverage(..., 'failed')` = false -> raise
    // P0001; la route lo devuelve como 422 con este texto.
    expect(error?.message).toContain('Pago adelantado requerido')
  })

  // 0230:289-300 y 0230:664-668: con compra previa y GPS enviado a > 400 m de la entrega, el
  // pedido va a la llamada; con `failed` ese disparador no se evalúa. Dos clientes distintos
  // para no chocar con «un pedido activo por negocio».
  it('compra previa: GPS a > 400 m va a `validando` (gps_warning_zone); sin GPS entra directo', async () => {
    const conGps = await crearCliente()
    await sembrarEntrega(conGps.tel9)
    const { data: lejos, error: e1 } = await pedir(conGps, {
      p_customer_gps_method: 'gps_high_accuracy',
      p_customer_gps_lat: LAT + 0.01, // ~1,1 km al norte de la entrega
      p_customer_gps_lng: LNG,
      p_customer_gps_accuracy_m: 10,
    })
    expect(e1, `debería entrar: ${e1?.message}`).toBeNull()
    const idLejos = (lejos as { id: string }).id
    pedidos.push(idLejos)
    const { data: a } = await db
      .from('orders')
      .select('status, requires_validation, validation_reason_code')
      .eq('id', idLejos)
      .single()
    expect(a?.status).toBe('validando')
    expect(a?.requires_validation).toBe(true)
    expect(a?.validation_reason_code).toBe('gps_warning_zone')

    const sinGps = await crearCliente()
    await sembrarEntrega(sinGps.tel9)
    const { data: libre, error: e2 } = await pedir(sinGps)
    expect(e2, `debería entrar: ${e2?.message}`).toBeNull()
    const idLibre = (libre as { id: string }).id
    pedidos.push(idLibre)
    const { data: b } = await db
      .from('orders')
      .select('status, requires_validation')
      .eq('id', idLibre)
      .single()
    expect(b?.status).toBe('pending_acceptance')
    expect(b?.requires_validation).toBe(false)
  })
})
