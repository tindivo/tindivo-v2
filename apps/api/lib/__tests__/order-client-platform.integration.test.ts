/**
 * El pedido guarda desde qué plataforma se hizo (D-33, D-53), migración 0281.
 *
 * La ruta lee `X-Tindivo-Platform` y la pasa en `p_args.client_platform`;
 * `create_order_idempotently` la deja en `tindivo.client_platform`, un ajuste
 * local a la transacción, y `orders.client_platform` la toma como DEFAULT al
 * insertar. Sin cabecera (la PWA de hoy) queda NULL.
 *
 * Cubre: el envoltorio por RPC (valor válido, ausente e inválido; que no se
 * herede entre llamadas; el reintento) y la ruta HTTP real con y sin cabecera.
 */
import { createClient } from '@supabase/supabase-js'
import { CLIENT_HEADERS } from '@tindivo/contracts'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { POST as postOrder } from '../../app/api/v1/customer/orders/route'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import { createIdempotently } from '../http/idempotency'
import { cleanup, localClient as db, E2E, seedContraentregaOrder } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const CLAVE = 'test-password-12345'
const NOMBRE = 'Vecino Plataforma'

interface Cliente {
  id: string
  email: string
  tel9: string
}

const clientes: Cliente[] = []
const pedidos: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

/** Un cliente de restaurantes con teléfono verificado, sin historial. */
async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const email = `plataforma-${tel9}@integration.local`
  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`no se pudo crear el auth user: ${error.message}`)
  const { error: perr } = await db.from('customer_profiles').insert({
    user_id: auth.user.id,
    full_name: NOMBRE,
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (perr) throw new Error(`no se pudo crear el perfil: ${perr.message}`)
  const c = { id: auth.user.id, email, tel9 }
  clientes.push(c)
  return c
}

/** Los argumentos de `create_customer_order` para un recojo en efectivo. */
function argsPedido(c: Cliente, extra: Record<string, unknown> = {}) {
  return {
    p_customer_user_id: c.id,
    p_business_id: E2E.BUSINESS_ID,
    p_delivery_method: 'pickup',
    p_payment_intent: 'pending_cash',
    p_customer_name: NOMBRE,
    p_customer_phone: c.tel9,
    p_delivery_address: '',
    p_delivery_reference: '',
    p_items: [{ menu_item_id: FIXTURES.ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_pickup_timing: 'now',
    ...extra,
  }
}

async function crearPorRpc(c: Cliente, extra: Record<string, unknown> = {}, key?: string) {
  const r = await createIdempotently(db, {
    userId: c.id,
    scope: 'create_order',
    key: key ?? crypto.randomUUID(),
    requestHash: 'hash-plataforma',
    args: argsPedido(c, extra),
  })
  const id = (r.data?.data as { id?: string } | undefined)?.id
  if (id && !pedidos.includes(id)) pedidos.push(id)
  return { ...r, id }
}

async function plataformaDe(orderId: string): Promise<string | null> {
  const { data } = await db
    .from('orders')
    .select('client_platform')
    .eq('id', orderId)
    .single()
    .throwOnError()
  return data.client_platform
}

async function borrarPedido(id: string) {
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('order_event_log').delete().eq('order_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('business_charges').delete().eq('order_id', id)
  await db.from('customer_strikes').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
}

async function signIn(email: string): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password: CLAVE })
  if (error || !data.session) throw new Error(`entrar como ${email} falló: ${error?.message}`)
  return data.session.access_token
}

/** Lo mismo que pide la prueba de conformidad: un pollo con extra queso, para recoger luego. */
function cuerpoRuta(c: Cliente) {
  return {
    businessId: E2E.BUSINESS_ID,
    deliveryMethod: 'pickup',
    pickupTiming: 'later',
    paymentIntent: 'prepaid',
    customerName: NOMBRE,
    customerPhone: c.tel9,
    items: [
      { menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 1, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
    ],
  }
}

async function crearPorRuta(c: Cliente, cabeceras: Record<string, string>) {
  const token = await signIn(c.email)
  const res = await postOrder(
    new Request('http://localhost:3001/api/v1/customer/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': crypto.randomUUID(),
        ...cabeceras,
      },
      body: JSON.stringify(cuerpoRuta(c)),
    }),
  )
  const body = (await res.json()) as { data?: { id?: string } }
  const id = body.data?.id
  if (id) pedidos.push(id)
  return { status: res.status, id, body }
}

afterEach(async () => {
  for (const id of pedidos.splice(0)) await borrarPedido(id)
})

afterAll(async () => {
  for (const c of clientes.splice(0)) {
    await db.from('creation_idempotency').delete().eq('user_id', c.id)
    await db.from('idempotency_keys').delete().eq('user_id', c.id)
    await db.from('customer_profiles').delete().eq('user_id', c.id)
    await db.from('user_roles').delete().eq('user_id', c.id)
    await db.from('users').delete().eq('id', c.id)
    await db.auth.admin.deleteUser(c.id)
  }
})

describe('create_order_idempotently guarda la plataforma', () => {
  it('con client_platform android, el pedido queda en android', async () => {
    const r = await crearPorRpc(await crearCliente(), { client_platform: 'android' })
    expect(r.error, r.error?.message).toBeNull()
    expect(await plataformaDe(String(r.id))).toBe('android')
  })

  it('sin client_platform, el pedido queda en NULL', async () => {
    const r = await crearPorRpc(await crearCliente())
    expect(r.error, r.error?.message).toBeNull()
    expect(await plataformaDe(String(r.id))).toBeNull()
  })

  it('un valor fuera de la lista se rechaza y no crea pedido ni reclama la clave', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const r = await crearPorRpc(c, { client_platform: 'windows' }, key)
    expect(r.error?.message).toBe('invalid_client_platform')
    const { count } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_user_id', c.id)
    expect(count).toBe(0)
    const { data: claves } = await db
      .from('creation_idempotency')
      .select('key')
      .eq('user_id', c.id)
      .eq('key', key)
    expect(claves).toEqual([])
  })

  it('la plataforma de una llamada no la hereda la siguiente', async () => {
    const ios = await crearPorRpc(await crearCliente(), { client_platform: 'ios' })
    const sin = await crearPorRpc(await crearCliente())
    expect(await plataformaDe(String(ios.id))).toBe('ios')
    expect(await plataformaDe(String(sin.id))).toBeNull()
  })

  it('un pedido que no pasa por el envoltorio queda en NULL', async () => {
    await crearPorRpc(await crearCliente(), { client_platform: 'android' })
    // Lo que inserta otra vía (la cajera, un script) no fija el ajuste de la transacción.
    const seed = await seedContraentregaOrder()
    try {
      expect(await plataformaDe(seed.orderId)).toBeNull()
    } finally {
      await cleanup(seed)
    }
  })

  it('el reintento con la misma clave devuelve el mismo pedido con su plataforma original', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const a = await crearPorRpc(c, { client_platform: 'android' }, key)
    const b = await crearPorRpc(c, { client_platform: 'android' }, key)
    expect(b.error, b.error?.message).toBeNull()
    expect(b.data?.replayed).toBe(true)
    expect(b.id).toBe(a.id)
    expect(await plataformaDe(String(a.id))).toBe('android')
  })
})

describe('POST /customer/orders manda la cabecera de plataforma', () => {
  it('con X-Tindivo-Platform android, el pedido queda en android', async () => {
    const r = await crearPorRuta(await crearCliente(), {
      [CLIENT_HEADERS.platform]: 'android',
      [CLIENT_HEADERS.app]: 'customer',
      [CLIENT_HEADERS.appVersion]: '99.0.0',
      [CLIENT_HEADERS.build]: '9999',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(await plataformaDe(String(r.id))).toBe('android')
  })

  it('sin cabeceras (la PWA de hoy), el pedido queda en NULL', async () => {
    const r = await crearPorRuta(await crearCliente(), {})
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(await plataformaDe(String(r.id))).toBeNull()
  })

  it('con una plataforma que no está en el contrato, el pedido queda en NULL', async () => {
    const r = await crearPorRuta(await crearCliente(), { [CLIENT_HEADERS.platform]: 'symbian' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(await plataformaDe(String(r.id))).toBeNull()
  })
})
