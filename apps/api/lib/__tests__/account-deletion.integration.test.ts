/**
 * Borrar la cuenta del cliente (0259 + DELETE /customer/account), contra la base
 * local y por la capa HTTP real (handler + JWT real).
 *
 * QUÉ AMARRA.
 *  · El pedido SOBREVIVE (importe, estado, negocio) pero sin nada de la persona.
 *  · No se toca ni un céntimo del ledger (`business_charges`): Tindivo no retiene
 *    fondos y la deuda es de los negocios.
 *  · Lo personal se va: perfil, direcciones, términos y la identidad de `auth`.
 *  · Lo que se conserva por antifraude sigue ahí (incidentes por teléfono).
 *  · Con pedido en curso, dinero sin resolver u otro rol: 409 y NADA cambia.
 *  · Ninguna otra cuenta se ve afectada.
 *
 * Mundo propio: un cliente `Vecino Borrado` por caso (lo barre
 * `vitest.global-setup.ts` si la corrida muere antes de borrarlo) y sus pedidos
 * cuelgan de negocios de fixture (`seedContraentregaOrder`), no del e2e.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DELETE as deleteAccount } from '../../app/api/v1/customer/account/route'
import {
  cleanup,
  localClient as db,
  type SeededOrder,
  seedContraentregaOrder,
  setOrderStatus,
} from './helpers/local-db'
import { callCreateCourierOrder, patchCourierSettings } from './helpers/local-db-courier'
import { cleanupPhoneSecurityFixtures } from './helpers/phone-security-fixtures'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

// biome-ignore lint/suspicious/noExplicitAny: las funciones nuevas aún no están en database.types.ts
const sdb = db as any

const NOMBRE = 'Vecino Borrado'
const RUN = Math.random().toString(36).slice(2, 8)
const PASSWORD = 'test-password-12345'

interface Cliente {
  userId: string
  email: string
  phone: string
  token: string
}

const seeds: SeededOrder[] = []
const clientes: string[] = []
let courierSettings: unknown = null
let telSeq = 0

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`entrar como ${email} falló: ${error?.message}`)
  return data.session.access_token
}

/** Un cliente completo: perfil verificado, dirección, términos y un incidente de antifraude. */
async function crearCliente(): Promise<Cliente> {
  telSeq += 1
  const phone = `9${String(Date.now()).slice(-6)}${String(telSeq).padStart(2, '0')}`
  const email = `borrado-${RUN}-${telSeq}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`crear cliente falló: ${error.message}`)
  const userId = data.user.id
  clientes.push(userId)

  const { error: pErr } = await db.from('customer_profiles').insert({
    user_id: userId,
    full_name: NOMBRE,
    phone: `+51${phone}`,
    phone_verified_at: new Date().toISOString(),
  })
  if (pErr) throw new Error(`perfil falló: ${pErr.message}`)
  const { error: aErr } = await db.from('customer_addresses').insert({
    user_id: userId,
    label: 'Casa',
    line: 'Jr. Secreto 123',
    reference: 'Casa de la señora',
    coordinates_lat: -9.1465,
    coordinates_lng: -78.2779,
    is_default: true,
  })
  if (aErr) throw new Error(`dirección falló: ${aErr.message}`)
  await db.from('terms_acceptance').insert({ user_id: userId, version: `b-${RUN}` })

  return { userId, email, phone, token: await signIn(email) }
}

/** Un pedido entregado con todos los datos personales rellenos. */
async function pedidoEntregadoDe(c: Cliente): Promise<SeededOrder> {
  const seed = await seedContraentregaOrder()
  seeds.push(seed)
  const { error } = await db
    .from('orders')
    .update({
      customer_user_id: c.userId,
      customer_name: 'Doña Rosa Quispe',
      customer_phone: c.phone,
      delivery_address: 'Jr. Secreto 123',
      delivery_reference: 'Casa de la señora',
      delivery_maps_url: 'https://maps.example/secreto',
      delivery_coordinates_lat: -9.1465,
      delivery_coordinates_lng: -78.2779,
      customer_notes: 'Toca dos veces',
      customer_gps_lat: -9.1466,
      customer_gps_lng: -78.278,
      customer_gps_accuracy_m: 12,
      customer_gps_distance_to_center_km: 1.2,
      delivery_coordinates_accuracy_m: 9,
      arrived_at_customer_lat: -9.1467,
      arrived_at_customer_lng: -78.2781,
      arrived_at_customer_accuracy_m: 7,
      business_notes: 'Llamar a Doña Rosa',
      driver_notes: 'Vive al fondo, casa verde',
      cancel_note: 'Rosa no contestó',
      rejection_reason_text: 'Rosa dijo que no',
    })
    .eq('id', seed.orderId)
  if (error) throw new Error(`personalizar pedido falló: ${error.message}`)

  // Las tablas hijas y los logs, con los mismos datos.
  const items = await db.from('customer_order_items').insert({
    order_id: seed.orderId,
    item_name_snapshot: 'Pollo',
    base_price_snapshot: 45,
    quantity: 1,
    unit_price: 45,
    line_total: 45,
    note: 'Sin ají, para Rosa',
  })
  if (items.error) throw new Error(`renglón falló: ${items.error.message}`)
  await db.from('order_event_log').insert({
    order_id: seed.orderId,
    event_type: 'order.manual_edited',
    actor_role: 'negocio',
    data: {
      customerPhone: { de: c.phone, a: '999999999' },
      customerName: { de: 'Rosa', a: 'Doña Rosa' },
      deliveryReference: { de: 'verde', a: 'Casa de la señora' },
      samePhoneBurst: true,
      total: { de: 47, a: 50 },
    },
  })
  await db
    .from('order_status_history')
    .update({ notes: 'cliente Rosa pidió llamar' })
    .eq('order_id', seed.orderId)
  await db.from('order_status_history').insert({
    order_id: seed.orderId,
    status: 'waiting_driver',
    notes: 'cliente Rosa pidió llamar',
  })
  await db.from('domain_events').insert({
    aggregate_type: 'order',
    aggregate_id: seed.orderId,
    event_type: 'Prueba',
    payload: { customerName: 'Rosa', status: 'x' },
  })
  return seed
}

async function pedidoEnCurso(c: Cliente): Promise<SeededOrder> {
  const seed = await pedidoEntregadoDe(c) // queda en waiting_driver: en curso
  return seed
}

async function entregar(seed: SeededOrder): Promise<void> {
  await db
    .from('orders')
    .update({ driver_id: 'e2e00000-0000-4000-8000-000000000050' })
    .eq('id', seed.orderId)
  await setOrderStatus(seed.orderId, 'delivered')
}

async function cargosDe(seed: SeededOrder): Promise<string> {
  const { data } = await db
    .from('business_charges')
    .select('id,amount,status,charge_type')
    .eq('business_id', seed.businessId)
    .order('id')
  return JSON.stringify(data ?? [])
}

function borrar(token?: string): Promise<Response> {
  return deleteAccount(
    new Request('http://localhost:3001/api/v1/customer/account', {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  )
}

beforeAll(async () => {
  const { count } = await db
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('id', 'e2e00000-0000-4000-8000-000000000010')
  if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  courierSettings = data?.value ?? null
  await patchCourierSettings({ enabled: true, ignoreSchedule: true })
})

afterAll(async () => {
  for (const seed of seeds) await cleanup(seed)
  for (const id of clientes) {
    await db.from('courier_orders').delete().eq('customer_user_id', id)
    await db.from('customer_incidents').delete().eq('customer_user_id', id)
    await db.from('reports').delete().eq('customer_user_id', id)
    // 0278: una cuenta borrada deja su historia del número.
    await cleanupPhoneSecurityFixtures(db, [id])
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
  if (courierSettings) {
    await db
      .from('app_settings')
      .update({ value: courierSettings as never })
      .eq('key', 'courier')
  }
})

describe('DELETE /customer/account: la cuenta se anonimiza y se va', () => {
  it('borra lo personal, deja el pedido sin la persona y no toca el ledger', async () => {
    const c = await crearCliente()
    const seed = await pedidoEntregadoDe(c)
    await entregar(seed)
    const cargosAntes = await cargosDe(seed)
    const { data: antes } = await db
      .from('orders')
      .select('order_amount,delivery_fee,status,business_id,payment_intent')
      .eq('id', seed.orderId)
      .single()

    // Una carrera de Entregas ya entregada.
    const created = await callCreateCourierOrder({
      customerUserId: c.userId,
      requesterPhone: c.phone,
    })
    expect(created.error).toBeNull()
    const courierId = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', courierId)
    const { data: courierAntes } = await db
      .from('courier_orders')
      .select('fee_amount,status')
      .eq('id', courierId)
      .single()

    // Antifraude por teléfono: debe sobrevivir.
    await db.from('customer_incidents').insert({
      customer_user_id: c.userId,
      customer_phone: c.phone,
      incident_type: 'no_show',
      is_strike: false,
    })

    const res = await borrar(c.token)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')

    // Identidad y datos personales: fuera.
    const { data: auth } = await db.auth.admin.getUserById(c.userId)
    expect(auth?.user ?? null).toBeNull()
    for (const [tabla, col] of [
      ['customer_profiles', 'user_id'],
      ['customer_addresses', 'user_id'],
      ['terms_acceptance', 'user_id'],
      ['user_roles', 'user_id'],
    ] as const) {
      const { count } = await db
        .from(tabla)
        .select('*', { count: 'exact', head: true })
        .eq(col, c.userId)
      expect(count, tabla).toBe(0)
    }

    // La lápida: sin correo ni nombre.
    const { data: lapida } = await db
      .from('users')
      .select('email,full_name,is_active')
      .eq('id', c.userId)
      .single()
    expect(lapida).toEqual({
      email: `deleted-${c.userId}@deleted.tindivo.invalid`,
      full_name: null,
      is_active: false,
    })

    // El pedido: mismo importe y estado, ninguna persona.
    const { data: pedido } = await db.from('orders').select('*').eq('id', seed.orderId).single()
    expect(pedido).toMatchObject({
      order_amount: antes?.order_amount,
      delivery_fee: antes?.delivery_fee,
      status: 'delivered',
      business_id: seed.businessId,
      customer_name: 'Cuenta eliminada',
      customer_phone: null,
      delivery_address: null,
      delivery_reference: null,
      delivery_maps_url: null,
      delivery_coordinates_lat: null,
      delivery_coordinates_lng: null,
      customer_notes: null,
      customer_gps_lat: null,
      customer_gps_lng: null,
    })

    // La carrera de Entregas: importe y estado, sin las personas.
    const { data: carrera } = await db
      .from('courier_orders')
      .select('*')
      .eq('id', courierId)
      .single()
    expect(carrera).toMatchObject({
      fee_amount: courierAntes?.fee_amount,
      status: 'delivered',
      requester_name: 'Cuenta eliminada',
      destination_name: 'Cuenta eliminada',
      destination_phone: null,
      origin_phone: null,
    })
    expect(carrera?.requester_phone).not.toBe(c.phone)

    // El dinero no se tocó.
    expect(await cargosDe(seed)).toBe(cargosAntes)

    // El antifraude por teléfono se conserva.
    const { data: incidentes } = await db
      .from('customer_incidents')
      .select('customer_phone')
      .eq('customer_user_id', c.userId)
    expect(incidentes).toEqual([{ customer_phone: c.phone }])
  })

  it('repetirla en la base responde already_deleted, y por HTTP el token ya no sirve', async () => {
    const c = await crearCliente()
    expect((await borrar(c.token)).status).toBe(204)
    const again = await sdb.rpc('delete_customer_account', { p_user_id: c.userId })
    expect(again.data).toEqual({ status: 'already_deleted' })
    expect((await borrar(c.token)).status).toBe(401)
  })

  it('con un pedido en curso: 409, y no cambia nada', async () => {
    const c = await crearCliente()
    const seed = await pedidoEnCurso(c)
    const res = await borrar(c.token)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; detail: string }
    expect(body.code).toBe('conflict')
    expect(body.detail).toMatch(/pedido en curso/i)

    const { data: auth } = await db.auth.admin.getUserById(c.userId)
    expect(auth?.user?.id).toBe(c.userId)
    const { count } = await db
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', c.userId)
    expect(count).toBe(1)
    const { data: pedido } = await db
      .from('orders')
      .select('customer_name')
      .eq('id', seed.orderId)
      .single()
    expect(pedido?.customer_name).toBe('Doña Rosa Quispe')

    // Cuando el pedido termina, ya se puede.
    await entregar(seed)
    expect((await borrar(c.token)).status).toBe(204)
  })

  it('con una devolución abierta (dinero): 409', async () => {
    const c = await crearCliente()
    await db.from('reports').insert({
      type: 'prepay_refund_review',
      status: 'open',
      customer_user_id: c.userId,
      description: 'prueba de borrado',
    })
    const res = await borrar(c.token)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { detail: string }).detail).toMatch(/devoluci/i)
    const { data: auth } = await db.auth.admin.getUserById(c.userId)
    expect(auth?.user?.id).toBe(c.userId)
  })

  it('una cuenta que además es de motorizado: 409, a soporte', async () => {
    const c = await crearCliente()
    await db.from('user_roles').insert({ user_id: c.userId, role: 'driver' })
    const res = await borrar(c.token)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { detail: string }).detail).toMatch(/soporte/i)
    const { count } = await db
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', c.userId)
    expect(count).toBe(2)
  })

  it('sin sesión: 401; con la sesión de alguien que no es cliente: 403 y su cuenta sigue', async () => {
    expect((await borrar()).status).toBe(401)
    const c = await crearCliente()
    await db.from('user_roles').delete().eq('user_id', c.userId).eq('role', 'customer')
    await db.from('user_roles').insert({ user_id: c.userId, role: 'driver' })
    expect((await borrar(c.token)).status).toBe(403)
    const { data } = await db.auth.admin.getUserById(c.userId)
    expect(data?.user?.id).toBe(c.userId)
  })

  it('el motorizado del mundo e2e, que también es cliente, queda protegido por el 409', async () => {
    const token = await signIn('motorizado@e2e.local', 'e2e-password-12345')
    expect((await borrar(token)).status).toBe(409)
    const { data } = await db.auth.admin.getUserById('e2e00000-0000-4000-8000-000000000002')
    expect(data?.user?.id).toBe('e2e00000-0000-4000-8000-000000000002')
  })

  it('no toca a las demás cuentas', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const seedB = await pedidoEntregadoDe(b)
    expect((await borrar(a.token)).status).toBe(204)
    const { data: pedidoB } = await db
      .from('orders')
      .select('customer_name,customer_phone')
      .eq('id', seedB.orderId)
      .single()
    expect(pedidoB).toEqual({ customer_name: 'Doña Rosa Quispe', customer_phone: b.phone })
    const { count } = await db
      .from('customer_addresses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', b.userId)
    expect(count).toBe(1)
  })

  it('las funciones no se pueden llamar con la sesión de un cliente', async () => {
    const c = await crearCliente()
    const asUser = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      global: { headers: { authorization: `Bearer ${c.token}` } },
      auth: { persistSession: false },
    })
    const { error } = await asUser.rpc(
      'delete_customer_account' as never,
      { p_user_id: c.userId } as never,
    )
    expect(error).not.toBeNull()
    const { data: auth } = await db.auth.admin.getUserById(c.userId)
    expect(auth?.user?.id).toBe(c.userId)
  })
})
