/**
 * Segunda ronda de la revisión de Codex sobre el borrado de cuenta (0259).
 *
 * Cada caso falla sin el arreglo que prueba:
 *  1. INVENTARIO medido en `information_schema`: toda columna con pinta de dato
 *     personal en pedidos, Entregas y tablas hijas está o ANONIMIZADA o en la lista
 *     explícita de lo CONSERVADO. Una columna nueva rompe el test hasta que alguien
 *     decida qué se hace con ella.
 *  2. COBERTURA real: se llenan todas, se borra, y ninguna conserva su valor.
 *  3. CARRERA: crear un pedido (restaurante o Entregas) sobre la lápida se rechaza.
 *  4. RESEÑAS: la reseña queda sin autor.
 *  5. NOTAS Y LOGS: notas libres y datos de los logs, redactados.
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

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

// biome-ignore lint/suspicious/noExplicitAny: tablas y funciones nuevas fuera de database.types.ts
const raw = db as any

const NOMBRE = 'Vecino Borrado'
const RUN = Math.random().toString(36).slice(2, 8)
const PASSWORD = 'test-password-12345'

const seeds: SeededOrder[] = []
const clientes: string[] = []
let courierSettings: unknown = null
let telSeq = 50

interface Cliente {
  userId: string
  phone: string
  token: string
}

async function crearCliente(): Promise<Cliente> {
  telSeq += 1
  const phone = `9${String(Date.now()).slice(-6)}${String(telSeq).padStart(2, '0')}`
  const email = `borrado2-${RUN}-${telSeq}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`crear cliente falló: ${error.message}`)
  const userId = data.user.id
  clientes.push(userId)
  await db.from('customer_profiles').insert({
    user_id: userId,
    full_name: NOMBRE,
    phone,
    phone_verified_at: new Date().toISOString(),
  })
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: sErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (sErr || !s.session) throw new Error(`entrar falló: ${sErr?.message}`)
  return { userId, phone, token: s.session.access_token }
}

function borrar(token: string): Promise<Response> {
  return deleteAccount(
    new Request('http://localhost:3001/api/v1/customer/account', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    }),
  )
}

/** Un pedido con CADA columna personal llena. */
const ORDER_PII = {
  customer_name: 'Doña Rosa Quispe',
  customer_phone: '900111222',
  delivery_address: 'Jr. Secreto 123',
  delivery_reference: 'Casa de la señora',
  delivery_maps_url: 'https://maps.example/secreto',
  delivery_coordinates_lat: -9.1465,
  delivery_coordinates_lng: -78.2779,
  delivery_coordinates_accuracy_m: 9,
  customer_notes: 'Toca dos veces',
  customer_gps_lat: -9.1466,
  customer_gps_lng: -78.278,
  customer_gps_accuracy_m: 12,
  customer_gps_distance_to_center_km: 1.2,
  arrived_at_customer_lat: -9.1467,
  arrived_at_customer_lng: -78.2781,
  arrived_at_customer_accuracy_m: 7,
  business_notes: 'Llamar a Doña Rosa',
  driver_notes: 'Vive al fondo, casa verde',
  cancel_note: 'Rosa no contestó',
  rejection_reason_text: 'Rosa dijo que no',
} as const

async function pedidoCompleto(c: Cliente): Promise<SeededOrder> {
  const seed = await seedContraentregaOrder()
  seeds.push(seed)
  const { error } = await db
    .from('orders')
    .update({ customer_user_id: c.userId, ...ORDER_PII, customer_phone: c.phone })
    .eq('id', seed.orderId)
  if (error) throw new Error(`personalizar pedido falló: ${error.message}`)
  await db.from('customer_order_items').insert({
    order_id: seed.orderId,
    item_name_snapshot: 'Pollo',
    base_price_snapshot: 45,
    quantity: 1,
    unit_price: 45,
    line_total: 45,
    note: 'Sin ají, para Rosa',
  })
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
  await db
    .from('orders')
    .update({ driver_id: 'e2e00000-0000-4000-8000-000000000050' })
    .eq('id', seed.orderId)
  await setOrderStatus(seed.orderId, 'delivered')
  return seed
}

beforeAll(async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  courierSettings = data?.value ?? null
  await patchCourierSettings({ enabled: true, ignoreSchedule: true })
})

afterAll(async () => {
  for (const seed of seeds) await cleanup(seed)
  for (const id of clientes) {
    await db.from('courier_orders').delete().eq('customer_user_id', id)
    await db.from('order_reviews').delete().eq('customer_user_id', id)
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

// ── 1. Inventario ────────────────────────────────────────────────────────────
/**
 * Columnas que el borrado VACÍA o sustituye. `tabla.columna`.
 */
const ANONIMIZADAS = new Set([
  ...Object.keys(ORDER_PII).map((c) => `orders.${c}`),
  'orders.address_directory_id',
  'courier_orders.requester_name',
  'courier_orders.requester_phone',
  'courier_orders.destination_name',
  'courier_orders.destination_phone',
  'courier_orders.destination_lat',
  'courier_orders.destination_lng',
  'courier_orders.destination_reference_text',
  'courier_orders.item_description',
  'courier_orders.driver_note',
  'courier_orders.origin_name',
  'courier_orders.origin_phone',
  'courier_orders.origin_lat',
  'courier_orders.origin_lng',
  'courier_orders.origin_reference_text',
  'customer_order_items.note',
  'order_status_history.notes',
  'order_event_log.data',
  'courier_order_events.data',
  'domain_events.payload',
  'domain_events.metadata',
])

/**
 * Columnas con pinta de dato personal que se CONSERVAN a propósito. Cada una es una
 * pregunta para Jesús en `Docs/trabajo/movil/08-mv5-requisitos-revision.md`.
 */
const CONSERVADAS = new Set([
  'orders.comprobante_prepago_url', // plazo de los comprobantes (D-44)
  'orders.customer_gps_method', // método, no ubicación
  'orders.customer_gps_validated_at', // fecha
  'orders.validation_context', // 'antifraud' | 'proof'
  'order_reviews.comment', // la nota de la reseña, sin autor (expediente §8)
  'customer_order_items.item_name_snapshot', // nombre del plato
  'customer_order_item_modifiers.group_name_snapshot',
  'customer_order_item_modifiers.option_name_snapshot',
])

const TABLAS = [
  'orders',
  'courier_orders',
  'customer_order_items',
  'customer_order_item_modifiers',
  'order_status_history',
  'order_event_log',
  'courier_order_events',
  'domain_events',
  'order_reviews',
]
const PINTA_PERSONAL =
  /(lat|lng|coord|address|reference|phone|name|note|gps|accuracy|maps|comment|description|text|data|payload|metadata|url)/

describe('inventario de columnas personales (medido)', () => {
  it('toda columna con pinta personal está anonimizada o conservada a propósito', async () => {
    const { data: cols, error: e2 } = await raw.rpc('table_columns_inventory', {
      p_tables: TABLAS,
    })
    if (e2) throw new Error(`table_columns_inventory falló: ${e2.message}`)
    expect((cols as unknown[]).length).toBeGreaterThan(50)
    const sinDecidir = (cols as { table_name: string; column_name: string }[])
      .filter((c) => PINTA_PERSONAL.test(c.column_name))
      .map((c) => `${c.table_name}.${c.column_name}`)
      .filter((k) => !ANONIMIZADAS.has(k) && !CONSERVADAS.has(k))
    expect(sinDecidir).toEqual([])
  })
})

// ── 2. Cobertura real ────────────────────────────────────────────────────────
describe('cada columna personal del pedido se vacía', () => {
  it('con todas llenas, ninguna conserva su valor', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    expect((await borrar(c.token)).status).toBe(204)

    const { data: pedido } = await db.from('orders').select('*').eq('id', seed.orderId).single()
    const row = pedido as Record<string, unknown>
    const vivas = Object.keys(ORDER_PII).filter(
      (k) => row[k] !== null && row[k] !== 'Cuenta eliminada',
    )
    expect(vivas).toEqual([])
    expect(row.arrived_at_customer_lat).toBeNull()
    expect(row.arrived_at_customer_lng).toBeNull()
    expect(row.arrived_at_customer_accuracy_m).toBeNull()
    expect(row.status).toBe('delivered')
  })
})

// ── 3. La carrera ────────────────────────────────────────────────────────────
describe('nada nuevo se escribe sobre la lápida', () => {
  it('un pedido del restaurante, una carrera de Entregas y un perfil se rechazan', async () => {
    const c = await crearCliente()
    expect((await borrar(c.token)).status).toBe(204)

    const seed = await seedContraentregaOrder()
    seeds.push(seed)
    // Un pedido ACTIVO con datos personales sobre la lápida: lo que la carrera permitía.
    const pedido = await db
      .from('orders')
      .update({ customer_user_id: c.userId, customer_name: 'Rosa' })
      .eq('id', seed.orderId)
    expect(pedido.error).toBeNull() // un UPDATE no es un alta: el guard es de INSERT
    const insert = await db.from('orders').insert({
      business_id: seed.businessId,
      short_id: 'ZZZZ2222',
      customer_user_id: c.userId,
      customer_name: 'Rosa',
      order_amount: 10,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'pending_acceptance',
    })
    expect(insert.error?.message).toMatch(/account was deleted/)

    const carrera = await callCreateCourierOrder({
      customerUserId: c.userId,
      requesterPhone: c.phone,
    })
    expect(carrera.error?.message ?? '').toMatch(/account was deleted/)
    const { count } = await db
      .from('courier_orders')
      .select('*', { count: 'exact', head: true })
      .eq('customer_user_id', c.userId)
    expect(count).toBe(0)

    const perfil = await db.from('customer_profiles').insert({ user_id: c.userId, full_name: 'X' })
    expect(perfil.error?.message).toMatch(/account was deleted/)
    const dir = await db.from('customer_addresses').insert({
      user_id: c.userId,
      label: 'Casa',
      line: 'Jr. Secreto 123',
      reference: 'x',
      coordinates_lat: -9.1465,
      coordinates_lng: -78.2779,
    })
    expect(dir.error?.message).toMatch(/account was deleted/)
  })

  it('una cuenta que NO se borró sigue pudiendo crear pedidos (el guard no estorba)', async () => {
    const c = await crearCliente()
    const seed = await seedContraentregaOrder()
    seeds.push(seed)
    const insert = await db.from('orders').insert({
      business_id: seed.businessId,
      short_id: 'YYYY2222',
      customer_user_id: c.userId,
      order_amount: 10,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'pending_acceptance',
    })
    expect(insert.error).toBeNull()
    await db.from('orders').delete().eq('short_id', 'YYYY2222')
  })
})

// ── 4. Reseñas ───────────────────────────────────────────────────────────────
describe('la reseña se queda sin autor', () => {
  it('conserva la nota y el comentario, y deja customer_user_id en NULL', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    const { error } = await db.from('order_reviews').insert({
      order_id: seed.orderId,
      business_id: seed.businessId,
      customer_user_id: c.userId,
      rating: 4,
      comment: 'Muy rico',
    })
    expect(error).toBeNull()
    expect((await borrar(c.token)).status).toBe(204)
    const { data } = await db
      .from('order_reviews')
      .select('customer_user_id,rating,comment')
      .eq('order_id', seed.orderId)
      .single()
    expect(data).toEqual({ customer_user_id: null, rating: 4, comment: 'Muy rico' })
  })
})

// ── 5. Notas y logs ──────────────────────────────────────────────────────────
describe('notas libres y logs sin rastro de la persona', () => {
  it('vacía las notas, redacta los logs y respeta importes y banderas', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    const created = await callCreateCourierOrder({
      customerUserId: c.userId,
      requesterPhone: c.phone,
    })
    const courierId = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', courierId)
    await db
      .from('courier_order_events')
      .update({ data: { requesterPhone: c.phone, destinationName: 'Rosa', feeAmount: 3 } })
      .eq('courier_order_id', courierId)

    expect((await borrar(c.token)).status).toBe(204)

    const { data: renglones } = await db
      .from('customer_order_items')
      .select('note')
      .eq('order_id', seed.orderId)
    expect(renglones).toEqual([{ note: null }])
    const { data: historial } = await db
      .from('order_status_history')
      .select('notes')
      .eq('order_id', seed.orderId)
    expect(historial?.every((h) => h.notes === null)).toBe(true)

    const { data: log } = await db
      .from('order_event_log')
      .select('data')
      .eq('order_id', seed.orderId)
      .eq('event_type', 'order.manual_edited')
      .single()
    expect(JSON.stringify(log?.data)).not.toMatch(/Rosa|Casa de la señora|verde|9999/)
    expect(log?.data).toMatchObject({ samePhoneBurst: true, total: { de: 47, a: 50 } })

    const { data: eventos } = await db
      .from('domain_events')
      .select('payload')
      .eq('aggregate_id', seed.orderId)
      .eq('event_type', 'Prueba')
    expect(eventos).toEqual([{ payload: { customerName: '[eliminado]', status: 'x' } }])

    const { data: deCarrera } = await db
      .from('courier_order_events')
      .select('data')
      .eq('courier_order_id', courierId)
    expect(JSON.stringify(deCarrera)).not.toMatch(new RegExp(`Rosa|${c.phone}`))
    expect(JSON.stringify(deCarrera)).toMatch(/"feeAmount":3/)
  })
})

// ── 6. Repetir por HTTP ──────────────────────────────────────────────────────
describe('repetir el borrado por HTTP', () => {
  it('responde 401, no 204: la identidad ya no existe (el OpenAPI lo dice así)', async () => {
    const c = await crearCliente()
    expect((await borrar(c.token)).status).toBe(204)
    expect((await borrar(c.token)).status).toBe(401)
  })
})
