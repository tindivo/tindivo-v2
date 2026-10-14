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
import { execFile } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DELETE as deleteAccount } from '../../app/api/v1/customer/account/route'
import {
  cleanup,
  localClient as db,
  E2E,
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
const liquidaciones: string[] = []
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
  for (const id of liquidaciones) {
    await db.from('orders').update({ cash_settlement_id: null }).eq('cash_settlement_id', id)
    await db.from('domain_events').delete().eq('aggregate_id', id)
    await db.from('cash_settlements').delete().eq('id', id)
  }
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
 * Las tablas las descubre la base (`personal_data_inventory`: todas las que cuelgan,
 * directa o indirectamente, de orders / courier_orders / users, más
 * `customer_otp_attempts`). Aquí solo se DECIDE qué se hace con cada una. Una tabla
 * nueva con FK, o una columna personal nueva en una tabla revisada, rompe el test
 * hasta que alguien decida.
 */

/** Se borran enteras (o se desvinculan) en la RPC. */
const BORRADAS = new Set([
  'customer_profiles',
  'customer_addresses',
  'push_subscriptions',
  'terms_acceptance',
  'order_review_dismissals',
  'promo_redemptions',
  'customer_otp_attempts',
  'user_roles',
])

/**
 * Se CONSERVAN a propósito. Cada una es una pregunta para Jesús en
 * `Docs/trabajo/movil/08-mv5-requisitos-revision.md` (antifraude, dinero, directorio).
 */
const CONSERVADAS = new Set([
  'customer_strikes',
  'customer_incidents',
  'reports',
  'address_directory',
  'fraud_coverage_claims',
  'business_charges', // el ledger: dinero
])

/** Datos del negocio, del motorizado o de la configuración: no son de la persona que se va. */
const AJENAS = new Set([
  'businesses',
  'drivers',
  'driver_restaurants',
  'app_settings',
  'admin_alerts',
  'cash_settlements',
  'restaurant_payments',
  'business_service_days',
  'delivery_zones',
  'directory_businesses',
  'map_landmarks',
  'store_products',
  'menu_categories',
  'menu_items',
  'menu_modifier_groups',
  'menu_modifier_options',
  'business_payment_qrs',
  'business_schedule',
  'push_delivery_log',
  'store_events',
  'store_product_images',
])

/** Tablas que se revisan columna por columna. */
const POR_COLUMNA = new Set([
  'orders',
  'courier_orders',
  'customer_order_items',
  'customer_order_item_modifiers',
  'order_status_history',
  'order_event_log',
  'courier_order_events',
  'order_reviews',
  'order_transfer_requests',
  'order_assignment_rejections',
  'domain_events', // sin FK: la RPC lo busca por aggregate_id y por ids dentro del payload
])

/** Columnas que el borrado VACÍA, redacta o sustituye. `tabla.columna`. */
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
  'order_transfer_requests.reason',
  'order_assignment_rejections.reason',
  'domain_events.payload',
  'domain_events.metadata',
  'domain_events.last_error', // texto de error del despacho: puede arrastrar el payload
  'courier_orders.utm_source', // texto libre de hasta 60 (contrato de Entregas)
])

/**
 * Columnas con pinta de texto o dato libre que se CONSERVAN a propósito, con su porqué.
 */
const CONSERVADAS_COLUMNA = new Set([
  'orders.comprobante_prepago_url', // plazo de los comprobantes (D-44)
  'orders.customer_gps_method', // método, no ubicación
  'orders.customer_gps_validated_at', // fecha
  'orders.validation_context', // 'antifraud' | 'proof'
  'orders.cancel_reason_detail', // enum con CHECK, no texto libre
  'orders.rejection_reason_code', // enum con CHECK
  'orders.validation_reason_code', // código
  'orders.cancel_reason', // enum, no texto
  'courier_orders.cancel_reason', // enum, no texto
  'customer_order_items.line_total', // importe
  'orders.risk_flags', // banderas booleanas de antifraude
  'order_reviews.tags', // etiquetas predefinidas
  'order_reviews.comment', // la nota de la reseña, sin autor (expediente §8)
  'customer_order_items.item_name_snapshot', // nombre del plato
  'customer_order_item_modifiers.group_name_snapshot',
  'customer_order_item_modifiers.option_name_snapshot',
])

/**
 * Columnas de texto/JSON que NO son personales, cada una con su porqué. Es una decisión
 * explícita, igual que las otras dos listas: no hay heurística por nombre.
 */
const NO_PERSONAL = new Set([
  'orders.short_id', // id público del pedido, no identifica a la persona
  'courier_orders.short_id',
  'orders.payment_proof_status', // enum con CHECK
  'orders.delivery_fee_source', // enum con CHECK
  'orders.pickup_timing', // enum con CHECK
  'orders.validation_result', // enum con CHECK
  'courier_orders.payment_method', // enum con CHECK
  'courier_order_events.actor_role', // rol, no persona
  'courier_order_events.event_type', // tipo de evento
  'order_event_log.actor_role',
  'order_event_log.event_type',
  'domain_events.aggregate_type',
  'domain_events.event_type',
])

const TIPOS_LIBRES = new Set(['text', 'character varying', 'character', 'jsonb', 'json', 'ARRAY'])

describe('inventario de tablas y columnas personales (medido por llaves foráneas)', () => {
  it('toda tabla con vínculo a pedidos o usuarios tiene una decisión', async () => {
    const { data, error } = await raw.rpc('personal_data_inventory')
    if (error) throw new Error(`personal_data_inventory falló: ${error.message}`)
    const cols = data as { table_name: string; column_name: string; data_type: string }[]
    const tablas = [...new Set(cols.map((c) => c.table_name))]
    expect(tablas.length).toBeGreaterThan(25)
    // El recorrido tiene que alcanzar las tablas que antes se escaparon.
    for (const t of [
      'order_transfer_requests',
      'order_assignment_rejections',
      'customer_otp_attempts',
      'customer_order_item_modifiers',
    ]) {
      expect(tablas, t).toContain(t)
    }
    const sinDecision = tablas.filter(
      (t) => !BORRADAS.has(t) && !CONSERVADAS.has(t) && !AJENAS.has(t) && !POR_COLUMNA.has(t),
    )
    expect(sinDecision).toEqual([])
  })

  it('TODA columna de texto o JSON de las tablas revisadas tiene una decisión explícita', async () => {
    const { data, error } = await raw.rpc('personal_data_inventory')
    if (error) throw new Error(`personal_data_inventory falló: ${error.message}`)
    const cols = data as { table_name: string; column_name: string; data_type: string }[]
    const revisadas = cols.filter(
      (c) => POR_COLUMNA.has(c.table_name) && TIPOS_LIBRES.has(c.data_type),
    )
    // Sin heurística por nombre: si la columna es de texto libre o JSON, se decide.
    expect(revisadas.map((c) => `${c.table_name}.${c.column_name}`)).toContain(
      'courier_orders.utm_source',
    )
    const sinDecidir = revisadas
      .map((c) => `${c.table_name}.${c.column_name}`)
      .filter((k) => !ANONIMIZADAS.has(k) && !CONSERVADAS_COLUMNA.has(k) && !NO_PERSONAL.has(k))
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
    // VINCULAR un pedido existente a la lápida también se rechaza (UPDATE).
    expect(pedido.error?.message).toMatch(/account was deleted/)
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
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        utm_source: 'campaña de Rosa Quispe',
      })
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
    const { data: carrera } = await db
      .from('courier_orders')
      .select('utm_source')
      .eq('id', courierId)
      .single()
    expect(carrera?.utm_source).toBeNull()
  })
})

// ── 5b. Eventos de OTRO agregado que referencian el pedido ───────────────────
async function entregarEfectivo(orderId: string): Promise<string> {
  // El efectivo que se debe sale de `payment_real` (52 = 50 + 2 de envío).
  const pago = await db.from('orders').update({ payment_real: 'paid_cash' }).eq('id', orderId)
  if (pago.error) throw new Error(`payment_real falló: ${pago.error.message} [${pago.error.hint}]`)
  const { data, error } = await db.rpc('deliver_order_cash', {
    p_driver_user_id: E2E.DRIVER_USER_ID,
    p_order_id: orderId,
  })
  if (error) throw new Error(`deliver_order_cash falló: ${error.message}`)
  const id = (data as { id: string }).id
  liquidaciones.push(id)
  return id
}

describe('el evento de la liquidación (CashDelivered) también se redacta', () => {
  it('pedido entregado, efectivo declarado, cuenta borrada: sin nombre y con el importe', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    const liquidacion = await entregarEfectivo(seed.orderId)
    const { data: antes } = await db
      .from('domain_events')
      .select('payload')
      .eq('aggregate_id', liquidacion)
      .eq('event_type', 'CashDelivered')
      .single()
    expect(antes?.payload).toMatchObject({ customerName: 'Doña Rosa Quispe' })

    expect((await borrar(c.token)).status).toBe(204)

    const { data: evento } = await db
      .from('domain_events')
      .select('payload')
      .eq('aggregate_id', liquidacion)
      .eq('event_type', 'CashDelivered')
      .single()
    expect(JSON.stringify(evento?.payload)).not.toMatch(/Rosa|Quispe/)
    expect(evento?.payload).toMatchObject({
      customerName: '[eliminado]',
      amount: 52,
      orderId: seed.orderId,
    })
  })
})

describe('la redacción de eventos solo localiza por UUID, nunca por shortId', () => {
  it('un evento de OTRO pedido con el mismo shortId no se toca', async () => {
    const c = await crearCliente()
    const created = await callCreateCourierOrder({
      customerUserId: c.userId,
      requesterPhone: c.phone,
    })
    const courierId = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', courierId)
    const { data: carrera } = await db
      .from('courier_orders')
      .select('short_id')
      .eq('id', courierId)
      .single()
    // `short_id` es único por tabla, no entre `orders` y `courier_orders`: un pedido
    // AJENO puede llevar el mismo.
    const ajeno = await seedContraentregaOrder()
    seeds.push(ajeno)
    const forzado = await db
      .from('orders')
      .update({ short_id: carrera?.short_id as string })
      .eq('id', ajeno.orderId)
    expect(forzado.error).toBeNull()
    const { data: evento } = await db
      .from('domain_events')
      .insert({
        aggregate_type: 'order',
        aggregate_id: ajeno.orderId,
        event_type: 'Prueba',
        payload: { shortId: carrera?.short_id, customerName: 'Otra Persona' },
      })
      .select('id')
      .single()

    expect((await borrar(c.token)).status).toBe(204)

    const { data: despues } = await db
      .from('domain_events')
      .select('payload')
      .eq('id', evento?.id as string)
      .single()
    expect(despues?.payload).toMatchObject({ customerName: 'Otra Persona' })
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

// ── 7. Registros con texto libre: lista de PERMITIDAS ────────────────────────
describe('los registros solo conservan claves declaradas seguras', () => {
  it('un motivo escrito a mano no sobrevive, venga en la clave que venga', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    await db.from('order_event_log').insert({
      order_id: seed.orderId,
      event_type: 'order.cancelled',
      actor_role: 'negocio',
      data: {
        reasonText: 'Rosa, celular 999111222',
        reason: 'Rosa no contesta',
        motivo: 'Rosa',
        clave_nueva_del_futuro: 'Jr. Secreto 123',
        anidado: { cualquiera: 'Rosa' },
        cancelReason: 'customer_request',
        total: { de: 47, a: 50 },
        ok: true,
      },
    })
    expect((await borrar(c.token)).status).toBe(204)
    const { data } = await db
      .from('order_event_log')
      .select('data')
      .eq('order_id', seed.orderId)
      .eq('event_type', 'order.cancelled')
      .single()
    expect(JSON.stringify(data?.data)).not.toMatch(/Rosa|999111222|Secreto/)
    expect(data?.data).toMatchObject({
      reasonText: '[eliminado]',
      reason: '[eliminado]',
      motivo: '[eliminado]',
      clave_nueva_del_futuro: '[eliminado]',
      cancelReason: 'customer_request',
      total: { de: 47, a: 50 },
      ok: true,
    })
  })

  it('el motivo libre de traspasos y de rechazos de asignación se vacía', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    const t = await db.from('order_transfer_requests').insert({
      order_id: seed.orderId,
      from_driver_id: 'e2e00000-0000-4000-8000-000000000050',
      to_driver_id: 'e2e00000-0000-4000-8000-0000000000d2',
      reason: 'La clienta Rosa vive lejos',
    })
    expect(t.error).toBeNull()
    const r = await db.from('order_assignment_rejections').insert({
      order_id: seed.orderId,
      driver_id: 'e2e00000-0000-4000-8000-000000000050',
      reason: 'Rosa no me da confianza',
    })
    expect(r.error).toBeNull()
    expect((await borrar(c.token)).status).toBe(204)
    const { data: tr } = await db
      .from('order_transfer_requests')
      .select('reason')
      .eq('order_id', seed.orderId)
    expect(tr).toEqual([{ reason: null }])
    const { data: re } = await db
      .from('order_assignment_rejections')
      .select('reason')
      .eq('order_id', seed.orderId)
    expect(re).toEqual([{ reason: null }])
  })
})

// ── 8. OTP en vuelo ──────────────────────────────────────────────────────────
describe('un OTP que se estaba enviando no deja rastro', () => {
  it('sellar un intento con teléfono sobre una cuenta borrada se rechaza', async () => {
    const c = await crearCliente()
    const antes = await db
      .from('customer_otp_attempts')
      .insert({ user_id: c.userId, phone: c.phone })
    expect(antes.error).toBeNull()
    expect((await borrar(c.token)).status).toBe(204)
    const { count } = await db
      .from('customer_otp_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', c.userId)
    expect(count).toBe(0)
    // Lo que haría /phone/send-code si Twilio tarda y la cuenta se borra mientras tanto.
    const tarde = await db
      .from('customer_otp_attempts')
      .insert({ user_id: c.userId, phone: c.phone })
    expect(tarde.error?.message).toMatch(/account was deleted/)
  })
})

// ── 9. Origen del directorio en Entregas ─────────────────────────────────────
describe('el origen de una carrera con negocio del directorio no se conserva tal cual', () => {
  it('se sustituye por los datos canónicos del directorio', async () => {
    const c = await crearCliente()
    const dir = await db
      .from('directory_businesses')
      .insert({
        name: 'ZZ Test MV4a Bodega Canónica',
        category: 'bodega',
        lat: -9.146,
        lng: -78.278,
        reference_text: 'Esquina del parque, referencia canónica',
        phone: '900555000',
        courier_enabled: true,
      })
      .select('id')
      .single()
    if (dir.error) throw new Error(`directorio falló: ${dir.error.message}`)
    const created = await raw.rpc('create_courier_order', {
      p_customer_user_id: c.userId,
      p_requester_name: 'Doña Rosa',
      p_requester_phone: c.phone,
      p_directory_business_id: dir.data.id,
      p_origin_name: 'Rosa (contacto personal)',
      p_origin_phone: '999000111',
      p_origin_lat: -9.146,
      p_origin_lng: -78.278,
      p_origin_reference_text: 'Casa de Rosa, puerta verde',
      p_destination_name: 'Pedro',
      p_destination_phone: '999000222',
      p_destination_lat: -9.1495,
      p_destination_lng: -78.2795,
      p_destination_reference_text: 'Casa de dos pisos, prueba',
      p_item_description: 'Un paquete',
      p_is_fragile: false,
      p_ready_in_min: 0,
      p_payer: 'destination',
      p_weight_confirmed: true,
      p_prepaid_confirmed: true,
    })
    expect(created.error).toBeNull()
    const id = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', id)
    expect((await borrar(c.token)).status).toBe(204)
    const { data } = await db
      .from('courier_orders')
      .select('origin_name,origin_phone,origin_reference_text,origin_lat,origin_lng')
      .eq('id', id)
      .single()
    expect(data).toEqual({
      origin_name: 'ZZ Test MV4a Bodega Canónica',
      origin_phone: '900555000',
      origin_reference_text: 'Esquina del parque, referencia canónica',
      origin_lat: -9.146,
      origin_lng: -78.278,
    })
    await db.from('courier_orders').delete().eq('id', id)
    await db.from('directory_businesses').delete().eq('id', dir.data.id)
  })
})

// ── 10. UPDATE sobre una cuenta borrada ──────────────────────────────────────
describe('un UPDATE sobre una cuenta borrada solo puede tocar columnas OPERATIVAS', () => {
  it('cualquier columna personal o de texto libre se rechaza, venga de donde venga', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    expect((await borrar(c.token)).status).toBe(204)

    for (const cambio of [
      { customer_phone: '999000999' },
      { customer_name: 'Rosa' },
      { delivery_address: 'Jr. Secreto 123' },
      { delivery_coordinates_lat: -9.1 },
      { business_notes: 'Llamar a Doña Rosa' },
      { driver_notes: 'Vive al fondo' },
      { cancel_note: 'Rosa no contestó' },
      { rejection_reason_text: 'Rosa dijo que no' },
      { arrived_at_customer_lat: -9.1467 },
      { arrived_at_customer_lng: -78.2781 },
      { arrived_at_customer_accuracy_m: 7 },
      { customer_notes: 'Toca dos veces' },
    ]) {
      const r = await db.from('orders').update(cambio).eq('id', seed.orderId)
      expect(r.error?.message, JSON.stringify(cambio)).toMatch(/account was deleted/)
    }
  })

  it('validation_reason_code y risk_flags (texto y JSON libres) tampoco se pueden escribir', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    expect((await borrar(c.token)).status).toBe(204)
    for (const cambio of [
      { validation_reason_code: 'Rosa, celular 999111222' },
      { risk_flags: { nota: 'Rosa, celular 999111222' } },
    ]) {
      const r = await db.from('orders').update(cambio).eq('id', seed.orderId)
      expect(r.error?.message, JSON.stringify(cambio)).toMatch(/account was deleted/)
    }
  })

  it('el cierre de caja real (el motorizado entrega el efectivo) sigue pasando', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    expect((await borrar(c.token)).status).toBe(204)
    // `deliver_order_cash` escribe `orders.cash_settlement_id` sobre un pedido ya anonimizado.
    const liquidacion = await entregarEfectivo(seed.orderId)
    const { data } = await db
      .from('orders')
      .select('cash_settlement_id,customer_name')
      .eq('id', seed.orderId)
      .single()
    expect(data).toEqual({ cash_settlement_id: liquidacion, customer_name: 'Cuenta eliminada' })
    // Y el evento nace ya sin nombre: la RPC lo lee del pedido anonimizado.
    const { data: ev } = await db
      .from('domain_events')
      .select('payload')
      .eq('aggregate_id', liquidacion)
      .single()
    expect(ev?.payload).toMatchObject({ customerName: 'Cuenta eliminada', amount: 52 })
    await setOrderStatus(seed.orderId, 'delivered') // sin cambios: pasa
  })

  it('una carrera de Entregas anonimizada: lo personal se rechaza, lo operativo pasa', async () => {
    const c = await crearCliente()
    const created = await callCreateCourierOrder({
      customerUserId: c.userId,
      requesterPhone: c.phone,
    })
    const id = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', id)
    expect((await borrar(c.token)).status).toBe(204)
    for (const cambio of [
      { destination_name: 'Rosa' },
      { driver_note: 'Rosa vive lejos' },
      { utm_source: 'campaña de Rosa' },
      { requester_phone: '999000999' },
    ]) {
      const r = await db.from('courier_orders').update(cambio).eq('id', id)
      expect(r.error?.message, JSON.stringify(cambio)).toMatch(/account was deleted/)
    }
    const ahora = new Date().toISOString()
    const ok = await db
      .from('courier_orders')
      .update({ transport_collected_at: ahora, remitted_at: ahora })
      .eq('id', id)
    expect(ok.error).toBeNull()
  })
})

// ── 11. Dos sesiones psql: candados ──────────────────────────────────────────
const DB_CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'

function psql(sql: string): Promise<{ out: string; err: string; ms: number }> {
  const t0 = Date.now()
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-At', '-c', sql],
      { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
      (_e, out, err) => resolve({ out, err, ms: Date.now() - t0 }),
    )
  })
}

async function haySesionesPsql(): Promise<boolean> {
  const r = await psql('select 1')
  return r.out.trim() === '1'
}

const sinPsql = !(await haySesionesPsql())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** La libreta guarda como `authenticated`, con el candado de aviso, igual que la API. */
function guardarDireccionComo(userId: string, pausa: number): string {
  return (
    `begin; set local role authenticated; ` +
    `select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true); ` +
    `select public.customer_address_save(null,'Casa','Jr. Nueva 1','ref nueva',-9.1465,-78.2779,now(),8,true); ` +
    `select pg_sleep(${pausa}); commit;`
  )
}

// ── Inventario de productores de `domain_events` ─────────────────────────────
// Cada fila es UNA función que inserta en `domain_events`, con (agregado, evento). La clase dice
// cómo la alcanza el borrado de cuenta (`delete_customer_account`, migración 0259):
//  - por_aggregate: el agregado es un pedido o una carrera; se redacta por `aggregate_id`. El
//    payload puede llevar datos del cliente (p. ej. `CustomerNoShow.phone`) y no importa.
//  - por_payload_uuid: otro agregado que lleva datos del cliente y referencia el pedido por UUID
//    en el payload (`CashDelivered`); el filtro de 0259 lo busca por `event_type` + esa clave.
//  - sin_datos_del_cliente: no lleva datos de personas del cliente. `claves` es la lista
//    PERMITIDA del payload: una clave nueva rompe el test hasta que alguien decida si es PII.
// `n` es cuántas inserciones de esa fila hay en la función.
type ClaseProductor =
  | { clase: 'por_aggregate'; n: number }
  | { clase: 'por_payload_uuid'; n: number }
  | { clase: 'sin_datos_del_cliente'; n: number; claves: string[] }
const PA = (n = 1): ClaseProductor => ({ clase: 'por_aggregate', n })
const INVENTARIO_PRODUCTORES: Record<string, ClaseProductor> = {
  'admin_correct_delivery_band|order|AdminCorrectedDeliveryBand': PA(),
  'advance_order|order|CustomerNoShow': PA(2),
  'advance_order|order|OrderReleased': PA(),
  'advance_order|order|OrderStatusChanged': PA(),
  'apply_order_transfer|order|TransferResolved': PA(),
  'block_business|business|BusinessBlocked': {
    clase: 'sin_datos_del_cliente',
    n: 1,
    claves: ['by', 'forDebt', 'reason'],
  },
  'cancel_customer_order|order|OrderStatusChanged': PA(),
  'confirm_order_cash|cash_settlement|CashConfirmed': {
    clase: 'sin_datos_del_cliente',
    n: 1,
    claves: ['amount', 'businessId', 'driverId'],
  },
  'courier_event_to_outbox|courier_order|CourierStepped': PA(),
  'create_appeal_report|order|order/appeal.created': PA(),
  'create_business_manual_order|order|OrderCreated': PA(),
  'create_customer_order|order|OrderCreated': PA(),
  'deliver_order_cash|cash_settlement|CashDelivered': { clase: 'por_payload_uuid', n: 1 },
  'dispute_cash_settlement|cash_settlement|CashDisputed': {
    clase: 'sin_datos_del_cliente',
    n: 1,
    claves: ['declared', 'reported'],
  },
  'enqueue_overdue_orders|order|OrderOverdue': PA(),
  'enqueue_queued_orders|order|OrderQueued': PA(),
  'expire_order|order|OrderExpired': PA(),
  'extend_order_prep|order|OrderPrepExtended': PA(),
  'register_prepay_proof|order|OrderPrepayProofUploaded': PA(),
  'request_order_transfer|order|TransferRequested': PA(),
  'resolve_cash_settlement|cash_settlement|CashResolved': {
    clase: 'sin_datos_del_cliente',
    n: 1,
    claves: ['amount'],
  },
  'respond_order_transfer|order|TransferResolved': PA(),
  'unblock_business|business|BusinessUnblocked': {
    clase: 'sin_datos_del_cliente',
    n: 1,
    claves: ['by'],
  },
  'validate_order|order|OrderProofVerified': PA(2),
  'validate_order|order|OrderStatusChanged': PA(2),
  'validate_order|order|OrderValidated': PA(2),
}

// ── Lector de SQL de los productores (puro: texto SQL de entrada → resultado) ─
// Límite residual, revisión HUMANA (no se verifica en estático): el VALOR de una clave permitida
// que salga de una variable de texto, y el SQL dinámico ofuscado a propósito (cadenas partidas en
// trozos que ya no dicen `domain` ni `events`).

/**
 * Tokenizador de cadenas ÚNICO (lo usan la normalización y los lectores de argumentos): si en `s[i]`
 * empieza una cadena, devuelve el índice SIGUIENTE a su final (o `s.length` si no cierra); si no, -1.
 * Reconoce `'…'` (con `''`), `E'…'` (con `\'` y `\\`, sin distinguir mayúsculas) y `$tag$…$tag$` / `$$…$$`.
 */
function finCadena(s: string, i: number): number {
  const c = s[i]
  const prev = s[i - 1] ?? ' '
  const recorre = (desde: number, escapes: boolean): number => {
    let j = desde
    while (j < s.length) {
      if (escapes && s[j] === '\\') j += 2
      else if (s[j] === "'") {
        if (s[j + 1] === "'") j += 2
        else return j + 1
      } else j++
    }
    return s.length
  }
  if (c === "'") return recorre(i + 1, false)
  if ((c === 'e' || c === 'E') && s[i + 1] === "'" && !/[\w$]/.test(prev))
    return recorre(i + 2, true)
  if (c === '$' && !/\w/.test(prev)) {
    const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(s.slice(i, i + 80))?.[0]
    if (!tag) return -1
    const fin = s.indexOf(tag, i + tag.length)
    return fin < 0 ? s.length : fin + tag.length
  }
  return -1
}

/** Posiciones [ini, fin) de todas las cadenas de `s`. */
function cadenasDe(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < s.length; i++) {
    const fin = finCadena(s, i)
    if (fin < 0) continue
    out.push([i, fin])
    i = fin - 1
  }
  return out
}

/** `s` con cada cadena sustituida por `f(cadena)`. */
function sinCadenas(s: string, f: (cadena: string) => string): string {
  let out = ''
  let ult = 0
  for (const [a, b] of cadenasDe(s)) {
    out += s.slice(ult, a) + f(s.slice(a, b))
    ult = b
  }
  return out + s.slice(ult)
}

/**
 * Deja el cuerpo de una función listo para BUSCAR en él, sin importar cómo esté escrito: quita
 * los comentarios de línea y de bloque (anidados), quita las comillas dobles de los identificadores,
 * pasa el código a minúsculas y colapsa el espacio en blanco. Las cadenas (`finCadena`) se
 * conservan tal cual, byte a byte: sus claves distinguen mayúsculas (`'customerName'`).
 */
function normalizarSql(src: string): string {
  let out = ''
  const espacio = () => {
    if (!out.endsWith(' ')) out += ' '
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string
    const fin = finCadena(src, i)
    if (fin >= 0) {
      out += src.slice(i, fin)
      i = fin - 1
    } else if (c === '-' && src[i + 1] === '-') {
      while (i < src.length && src[i] !== '\n') i++
      espacio()
    } else if (c === '/' && src[i + 1] === '*') {
      let prof = 1
      i += 2
      while (i < src.length && prof > 0) {
        if (src[i] === '/' && src[i + 1] === '*') {
          prof++
          i++
        } else if (src[i] === '*' && src[i + 1] === '/') {
          prof--
          i++
        }
        i++
      }
      i--
      espacio()
    } else if (c === '"') {
      // comilla de identificador: fuera
    } else if (/\s/.test(c)) {
      espacio()
    } else {
      out += c.toLowerCase()
    }
  }
  return out
}

/** Toda mención de la tabla, escrita como se escriba (el texto ya viene normalizado). */
const MENCION_TABLA = /(?<![\w$])domain_events(?![\w$])/g
const INSERCION_TABLA = /(?<![\w$])insert into (?:(\w+)\.)?domain_events(?![\w$])/g

/** Recorre `s` desde el `(` de `abre` y devuelve los argumentos de primer nivel. */
function leerArgumentos(s: string, abre: number): { args: string[]; cierra: number } | null {
  const args: string[] = []
  let actual = ''
  let prof = 0
  for (let i = abre; i < s.length; i++) {
    const c = s[i] as string
    const fin = finCadena(s, i)
    if (fin >= 0) {
      actual += s.slice(i, fin)
      i = fin - 1
      continue
    }
    if (c === '(') {
      prof++
      if (prof === 1) continue
    } else if (c === ')') {
      prof--
      if (prof === 0) {
        args.push(actual.trim())
        return { args, cierra: i }
      }
    } else if (c === ',' && prof === 1) {
      args.push(actual.trim())
      actual = ''
      continue
    }
    actual += c
  }
  return null
}

// Constructores que no se saben analizar como valor de una clave: su contenido puede traer claves
// que no se ven en el texto (`to_jsonb(fila)`, `a || b`, una variable jsonb…). Piden clasificación manual.
const CONSTRUCTOR_OPACO =
  /\b(to_jsonb?|row_to_json|array_to_json|jsonb?_agg|jsonb?_object_agg|array_agg|jsonb?_build_array|jsonb?_object|jsonb_(?:set|insert|strip_nulls|populate\w*|path\w*|each\w*|array_elements\w*|extract\w*|concat)|row|select)\b|\|\||::\s*jsonb?\b|->(?!>)|#>|@>|\[/

// ── Lista de PERMITIDOS para los VALORES de un payload `sin_datos_del_cliente` ─
// Una lista de prohibidos nunca cierra: `jsonb_build_object('amount', contact_json())` esconde
// `customerName` dentro de un auxiliar. Por eso el valor de cada clave, a cualquier profundidad, solo
// pasa si es una de estas formas; todo lo demás pide REVISIÓN MANUAL con su motivo:
//  - literal (cadena, número, true/false, NULL);
//  - un constructor json(b)_build_object (de pg_catalog o public), cuyas claves y valores se leen aparte;
//  - `x::tipo` o `CAST(x AS tipo)` de algo permitido, a un tipo ESCALAR (no json/jsonb/record);
//  - una variable o parámetro cuyo tipo se resuelve como escalar (DECLARE + argumentos de la función);
//  - `v.campo` de un registro, solo si se resuelve (por el catálogo) que el campo es escalar;
//  - una función de FUNCIONES_ESCALARES con argumentos también permitidos.
// Límite residual, revisión HUMANA: un valor escalar de TEXTO que venga de una variable (puede llevar
// un nombre) y el SQL dinámico ofuscado.

/** Variables/parámetros (`nombre → tipo`) y columnas del catálogo (`tabla.columna → tipo`). */
type ContextoTipos = {
  vars: Map<string, string>
  campos: Map<string, string>
  /**
   * Hay algo que puede tapar o cambiar el tipo de un nombre: más de un DECLARE, un bucle
   * `FOR … IN` / `FOREACH … IN`, o un cursor (PL/pgSQL redeclara la variable del bucle como record).
   */
  anidado?: boolean
}
const SIN_CONTEXTO: ContextoTipos = { vars: new Map(), campos: new Map() }

const TIPOS_ESCALARES = new Set([
  'uuid',
  'text',
  'varchar',
  'character varying',
  'char',
  'character',
  'bpchar',
  'numeric',
  'decimal',
  'integer',
  'int',
  'int4',
  'bigint',
  'int8',
  'smallint',
  'int2',
  'real',
  'float4',
  'double precision',
  'float8',
  'boolean',
  'bool',
  'date',
  'time',
  'time without time zone',
  'time with time zone',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
])
// Funciones escalares puras permitidas con argumentos permitidos. Ningún productor vigente las usa
// en un payload (hoy solo hay variables, parámetros y campos de registro): se admiten porque son
// puras, y hay que volver a revisar esta lista cuando un productor real pida otra.
const FUNCIONES_ESCALARES = new Set(['now', 'round', 'coalesce'])

const sinDecoracion = (t: string) =>
  t
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
/**
 * TIPOS (variables, parámetros, casts, columnas): solo es escalar el que viene sin esquema o con
 * `pg_catalog.` y está en la lista. Cualquier otro esquema (`public.` incluido) pide revisión manual:
 * `CREATE DOMAIN public.text AS jsonb` haría pasar JSON por un `text`.
 */
function esTipoEscalar(t: string): boolean {
  return TIPOS_ESCALARES.has(sinDecoracion(t).replace(/^pg_catalog\./, ''))
}
/** TABLAS (`v public.cash_settlements`, `%rowtype`): aquí `public.` y `pg_catalog.` solo cualifican el nombre. */
const nombreDeTabla = (t: string) => sinDecoracion(t).replace(/^(?:public|pg_catalog)\./, '')

/** `p_id uuid, p_data jsonb DEFAULT x` (de `pg_get_function_arguments`) → `nombre → tipo`. */
function argumentosDe(args: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!args?.trim()) return out
  const trozos = leerArgumentos(`(${sinCadenas(args, () => "''")})`, 0)?.args ?? []
  for (const t of trozos) {
    const sinDefecto = t.replace(/\s+(?:default|=)\s.*$/i, '').trim()
    const m = /^(?:(?:in|out|inout|variadic)\s+)?([A-Za-z_]\w*)\s+(.+)$/i.exec(sinDefecto)
    if (m) out[(m[1] as string).toLowerCase()] = (m[2] as string).trim()
  }
  return out
}

/** Variables de la sección DECLARE del cuerpo (ya normalizado) → `nombre → tipo`. */
function declaradasEn(norm: string): Record<string, string> {
  const out: Record<string, string> = {}
  const t = sinCadenas(norm, () => "''")
  const d = /(?<![\w$])declare(?![\w$])/.exec(t)
  if (!d) return out
  const resto = t.slice(d.index + d[0].length)
  const b = /(?<![\w$])begin(?![\w$])/.exec(resto)
  const seccion = b ? resto.slice(0, b.index) : resto
  for (const decl of seccion.split(';')) {
    const m =
      /^\s*([a-z_][\w$]*)\s+(?:constant\s+)?(.+?)(?:\s*(?::=|=|default)\s.*|\s*(?::=|=).*)?$/.exec(
        decl,
      )
    if (m) out[m[1] as string] = (m[2] as string).trim()
  }
  return out
}

// Construcciones que declaran variables de forma implícita o cambian su tipo: `FOR x IN …` (rango,
// SELECT, cursor, EXECUTE), `FOREACH x IN ARRAY …` y los cursores. Los bloques EXCEPTION no
// redeclaran nada y no cuentan. Un falso positivo solo pide una revisión manual de más.
const AMBITO_IMPLICITO =
  /(?<![\w$])(?:for\s+(?!(?:update|share|no|key)(?![\w$]))[a-z_][\w$.]*(?:\s*,\s*[a-z_][\w$.]*)*\s+in(?![\w$])|foreach(?![\w$])|(?:ref)?cursor(?![\w$]))/

/** Contexto de tipos de una función: sus argumentos y su DECLARE (este gana si se repite). */
function contextoDe(
  norm: string,
  args: string | undefined,
  campos: Map<string, string>,
): ContextoTipos {
  const t = sinCadenas(norm, () => "''")
  return {
    vars: new Map(Object.entries({ ...argumentosDe(args), ...declaradasEn(norm) })),
    campos,
    anidado: [...t.matchAll(/(?<![\w$])declare(?![\w$])/g)].length > 1 || AMBITO_IMPLICITO.test(t),
  }
}

/** Posición del último `::` de nivel 0 (fuera de paréntesis), o -1. */
function ultimoCast(t: string): number {
  let prof = 0
  let ult = -1
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (prof === 0 && c === ':' && t[i + 1] === ':') {
      ult = i
      i++
    }
  }
  return ult
}

const MOTIVO_ANIDADO =
  'la función tiene bloques DECLARE anidados, bucles FOR/FOREACH o cursores y un nombre podría estar tapado o redeclarado: no se resuelve el tipo'

/** null si el valor es una forma permitida; si no, el motivo por el que pide revisión manual. */
function motivoNoPermitido(valor: string, ctx: ContextoTipos): string | null {
  const t = sinCadenas(valor, () => "''")
    .trim()
    .toLowerCase()
  const manual = (motivo: string) => `${motivo}: ${valor.trim().slice(0, 60)}`
  if (t === '') return manual('valor vacío')
  if (t === "''" || /^-?\d+(?:\.\d+)?$/.test(t) || /^(?:true|false|null)$/.test(t)) return null
  if (t.startsWith('(')) {
    const par = leerArgumentos(t, 0)
    if (par && par.cierra === t.length - 1 && par.args.length === 1)
      return motivoNoPermitido((par.args[0] as string).trim(), ctx)
  }
  const cast = ultimoCast(t)
  if (cast >= 0) {
    const tipo = t.slice(cast + 2).trim()
    if (!esTipoEscalar(tipo)) return manual(`conversión a un tipo que no es escalar (${tipo})`)
    return motivoNoPermitido(t.slice(0, cast), ctx)
  }
  const llamada = /^((?:[a-z_]\w*\s*\.\s*)?)([a-z_]\w*)\s*\(/.exec(t)
  if (llamada) {
    const par = leerArgumentos(t, llamada[0].length - 1)
    if (!par || par.cierra !== t.length - 1) return manual('expresión compuesta (operador)')
    const esquema = (llamada[1] ?? '').replace(/\s+/g, '')
    const nombre = llamada[2] as string
    const args = par.args.filter((a) => a !== '')
    if (
      /^json(?:b)?_build_object$/.test(nombre) &&
      ['', 'pg_catalog.', 'public.'].includes(esquema)
    )
      return null // sus claves y valores se leen por separado, uno a uno
    if (nombre === 'cast' && esquema === '') {
      const m = /^(.*)\s+as\s+([^()]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)$/.exec(args[0] ?? '')
      if (args.length !== 1 || !m) return manual('CAST no reconocido')
      if (!esTipoEscalar(m[2] as string))
        return manual(`conversión a un tipo que no es escalar (${(m[2] as string).trim()})`)
      return motivoNoPermitido(m[1] as string, ctx)
    }
    if (FUNCIONES_ESCALARES.has(nombre) && ['', 'pg_catalog.'].includes(esquema)) {
      // `coalesce` es sintaxis SQL: no se resuelve por search_path. `now` y `round` sí: solo valen
      // escritas con esquema (`pg_catalog.now()`); ni siquiera un `proconfig` vacío lo garantiza,
      // porque un `set_config('search_path', …)` en el cuerpo lo cambia en tiempo de ejecución.
      if (nombre !== 'coalesce' && esquema === '')
        return manual(
          `llamada sin esquema a ${nombre} (escríbela pg_catalog.${nombre}: el search_path puede cambiar en tiempo de ejecución)`,
        )
      for (const a of args) {
        const m = motivoNoPermitido(a, ctx)
        if (m) return m
      }
      return null
    }
    return manual(`llamada a una función que no está en la lista (${esquema}${nombre})`)
  }
  if (/^[a-z_][\w$]*$/.test(t)) {
    if (ctx.anidado) return manual(MOTIVO_ANIDADO)
    const tipo = ctx.vars.get(t)
    if (tipo === undefined) return manual('identificador sin tipo resuelto')
    return esTipoEscalar(tipo) ? null : manual(`variable de tipo no escalar (${tipo})`)
  }
  const campo = /^([a-z_][\w$]*)\.([a-z_][\w$]*)$/.exec(t)
  if (campo) {
    if (ctx.anidado) return manual(MOTIVO_ANIDADO)
    const tipo = ctx.vars.get(campo[1] as string)
    if (tipo === undefined) return manual('registro sin tipo resuelto')
    const tabla = nombreDeTabla(tipo.replace(/%rowtype$/i, ''))
    const tipoCampo = ctx.campos.get(`${tabla}.${campo[2]}`)
    if (tipoCampo === undefined) return manual(`campo de registro sin tipo resuelto (${tipo})`)
    return esTipoEscalar(tipoCampo) ? null : manual(`campo no escalar (${tipoCampo})`)
  }
  return manual('forma no permitida (operador, subselect u otra expresión)')
}

type PayloadLeido = {
  /** Claves del primer nivel (null si el payload no es un `jsonb_build_object` literal). */
  top: string[] | null
  /** Claves de TODOS los `jsonb_build_object` / `json_build_object`, a cualquier profundidad. */
  todas: string[]
  /** Por qué no se puede analizar (null si se pudo): obliga a clasificar a mano. */
  error: string | null
}

/** Claves literales de un payload, con los constructores anidados incluidos. */
function leerPayload(payload: string, ctx: ContextoTipos = SIN_CONTEXTO): PayloadLeido {
  const todas: string[] = []
  const errores: string[] = []
  let top: string[] | null = null
  // Se buscan fuera de las cadenas: se tapan con espacios, que no cambian las posiciones.
  const tapado = sinCadenas(payload, (m) => ' '.repeat(m.length))
  // Con o sin esquema delante (`pg_catalog.jsonb_build_object`): el `.` no esconde el constructor.
  for (const m of tapado.matchAll(/(?<![\w.])((?:\w+\s*\.\s*)*)json(?:b)?_build_object\s*\(/g)) {
    const esquema = (m[1] ?? '').replace(/\s+/g, '')
    if (esquema !== '' && esquema !== 'pg_catalog.' && esquema !== 'public.') {
      errores.push(`constructor de otro esquema (${esquema.slice(0, -1)}): revisión manual`)
      continue
    }
    const p = leerArgumentos(payload, m.index + m[0].length - 1)
    if (!p) {
      errores.push('constructor sin cerrar')
      continue
    }
    if (p.args.length % 2 !== 0) errores.push('jsonb_build_object con argumentos impares')
    const claves: string[] = []
    p.args.forEach((a, i) => {
      if (i % 2 !== 0) return
      const k = /^'([^']*)'(?:::text)?$/.exec(a)?.[1]
      if (k === undefined) errores.push(`clave que no es un literal: ${a.slice(0, 40)}`)
      else claves.push(k)
    })
    p.args.forEach((a, i) => {
      if (i % 2 === 0) return
      const motivo = motivoNoPermitido(a, ctx)
      if (motivo) errores.push(`valor no permitido, revisión manual: ${motivo}`)
    })
    todas.push(...claves)
    if (m.index === 0 && p.cierra === payload.length - 1) top = claves
  }
  if (top === null) errores.push('el payload no es un jsonb_build_object literal')
  const opaco = CONSTRUCTOR_OPACO.exec(sinCadenas(payload, () => "''"))
  if (opaco) errores.push(`construcción no analizable: ${opaco[0]}`)
  return { top, todas, error: errores.length > 0 ? errores.join('; ') : null }
}

type InsercionLeida = { agregado: string; evento: string; payload: PayloadLeido }

/** Una inserción (texto normalizado, desde `insert into`): agregado, evento y payload. */
function leerInsercion(s: string, ctx: ContextoTipos = SIN_CONTEXTO): InsercionLeida | string {
  const cols = /^insert into (?:\w+\.)?domain_events\s*\(/.exec(s)
  if (!cols) return 'inserción con forma no reconocida'
  const c = leerArgumentos(s, cols[0].length - 1)
  if (!c) return 'lista de columnas sin cerrar'
  const v = /^\s*values\s*\(/.exec(s.slice(c.cierra + 1))
  if (!v) return 'no es INSERT … VALUES (…)'
  const a = leerArgumentos(s, c.cierra + 1 + v[0].length - 1)
  if (!a || a.args.length !== c.args.length) return 'valores no alineados con las columnas'
  const col = (n: string) => a.args[c.args.map((x) => x.trim()).indexOf(n)]
  const agregado = /^'(\w+)'$/.exec(col('aggregate_type') ?? '')?.[1]
  const evento = /^'([^']+)'$/.exec(col('event_type') ?? '')?.[1]
  if (!agregado || !evento) return 'aggregate_type o event_type no son literales'
  return { agregado, evento, payload: leerPayload(col('payload') ?? '', ctx) }
}

// Menciones de `domain_events` que NO son inserciones, justificadas una a una (función → cuántas).
const NO_INSERCIONES: Record<string, { n: number; motivo: string }> = {
  delete_customer_account: {
    n: 1,
    motivo: 'el UPDATE que redacta los eventos del cliente (0259); se lee más abajo',
  },
  personal_data_inventory: {
    n: 1,
    motivo:
      'lectura de catálogo: suma la tabla a las relaciones que inventaría (UNION SELECT ::regclass)',
  },
}
// Funciones con EXECUTE que pueden nombrar `domain_events`, revisadas a mano (nombre → qué hacen).
// Hoy ninguna: una nueva rompe el test hasta que alguien la lea y la anote aquí con su motivo.
const EXECUTE_REVISADOS: Record<string, string> = {}

type FuenteFuncion = { f: string; s: string; args?: string; config?: string[] | null }
type Productor = { n: number; top: Set<string> | null; todas: Set<string>; error: string | null }

/**
 * Toda mención de `domain_events` queda justificada: o es una inserción leída y clasificada, o
 * está en `NO_INSERCIONES`. Un `EXECUTE` que pueda armar el nombre obliga a revisión manual.
 */
function analizarFunciones(funciones: FuenteFuncion[], campos: Map<string, string> = new Map()) {
  const reales = new Map<string, Productor>()
  const otras = new Map<string, number>()
  const problemas: string[] = []
  for (const fn of funciones) {
    const norm = normalizarSql(fn.s)
    const menciones = [...norm.matchAll(MENCION_TABLA)].length
    const literales = cadenasDe(norm).map(([a, b]) => norm.slice(a, b).toLowerCase())
    if (
      /(?<![\w$])execute(?![\w$])/.test(norm) &&
      (menciones > 0 || literales.some((l) => /domain|events/.test(l))) &&
      !(fn.f in EXECUTE_REVISADOS)
    )
      problemas.push(
        `${fn.f}: EXECUTE que puede armar el nombre de domain_events; revísalo a mano y anótalo en EXECUTE_REVISADOS`,
      )
    const ctx = contextoDe(norm, fn.args, campos)
    let leidas = 0
    for (const m of norm.matchAll(INSERCION_TABLA)) {
      leidas++
      if (m[1] && m[1] !== 'public') {
        problemas.push(`${fn.f}: inserción en el esquema '${m[1]}' (clasifícalo a mano)`)
        continue
      }
      const ins = leerInsercion(norm.slice(m.index, m.index + 6000), ctx)
      if (typeof ins === 'string') {
        problemas.push(`${fn.f}: ${ins} (clasifícalo a mano)`)
        continue
      }
      const k = `${fn.f}|${ins.agregado}|${ins.evento}`
      const p = reales.get(k) ?? {
        n: 0,
        top: new Set<string>(),
        todas: new Set<string>(),
        error: null,
      }
      p.n += 1
      p.top = ins.payload.top && p.top ? new Set([...p.top, ...ins.payload.top]) : null
      for (const c of ins.payload.todas) p.todas.add(c)
      p.error = p.error ?? ins.payload.error
      reales.set(k, p)
    }
    if (menciones > leidas) otras.set(fn.f, menciones - leidas)
  }
  for (const [f, n] of otras) {
    const ok = NO_INSERCIONES[f]
    if (!ok)
      problemas.push(
        `${f}: ${n} mención(es) de domain_events sin justificar (ni inserción ni NO_INSERCIONES)`,
      )
    else if (ok.n !== n)
      problemas.push(`${f}: ${n} mención(es) que no son inserción y NO_INSERCIONES dice ${ok.n}`)
  }
  return { reales, otras, problemas }
}

// Pruebas puras del lector: texto SQL de entrada → resultado. No tocan la base.
describe('lector de SQL de los productores de domain_events (puro)', () => {
  /** Contexto de tipos: variables/parámetros y columnas `tabla.columna` ya resueltas. */
  const ctx = (vars: Record<string, string>, campos: Record<string, string> = {}) => ({
    vars: new Map(Object.entries(vars)),
    campos: new Map(Object.entries(campos)),
  })
  const ins = (cuerpo: string) => analizarFunciones([{ f: 'f_prueba', s: cuerpo }])
  const CUERPO = `values ('cash_settlement', gen_random_uuid(), 'CashConfirmed', jsonb_build_object('amount', v))`

  it('detecta la inserción escrita de forma normal', () => {
    const r = ins(
      `begin insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) ${CUERPO}; end`,
    )
    expect(r.problemas).toEqual([])
    expect([...r.reales.keys()]).toEqual(['f_prueba|cash_settlement|CashConfirmed'])
  })

  it('(a) con un comentario de bloque entre INSERT e INTO', () => {
    const r = ins(
      `INSERT /* x */ INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload) ${CUERPO};`,
    )
    expect(r.problemas).toEqual([])
    expect([...r.reales.keys()]).toEqual(['f_prueba|cash_settlement|CashConfirmed'])
  })

  it('(b) con el identificador entre comillas dobles y comentarios de línea', () => {
    const r = ins(
      `INSERT -- x\n INTO public."domain_events" (aggregate_type, aggregate_id, event_type, payload) ${CUERPO};`,
    )
    expect(r.problemas).toEqual([])
    expect([...r.reales.keys()]).toEqual(['f_prueba|cash_settlement|CashConfirmed'])
  })

  it('(c) un EXECUTE con la cadena partida no pasa en silencio', () => {
    const entera = ins(`execute 'INSERT INTO ' || 'public.domain_events (payload) values (1)';`)
    expect(entera.problemas.join('|')).toMatch(/f_prueba: EXECUTE/)
    expect(entera.problemas.join('|')).toMatch(/mención\(es\) de domain_events sin justificar/)
    const partida = ins(`execute 'insert into public.domain_' || 'events (payload) values (1)';`)
    expect(partida.problemas.join('|')).toMatch(/f_prueba: EXECUTE/)
  })

  it('una mención que no es inserción (UPDATE, SELECT) pide justificación', () => {
    const r = ins(
      `update public.domain_events set payload = '{}'; select count(*) from "public"."DOMAIN_EVENTS";`,
    )
    expect(r.problemas).toEqual([
      expect.stringMatching(/2 mención\(es\) de domain_events sin justificar/),
    ])
  })

  it('una inserción que no es INSERT … VALUES se manda a clasificar a mano', () => {
    const r = ins(`insert into public.domain_events select * from otra;`)
    expect(r.problemas).toEqual([expect.stringMatching(/forma no reconocida/)])
  })

  it('(d) lee las claves de los constructores anidados a cualquier profundidad', () => {
    const p = leerPayload(
      `jsonb_build_object('amount', jsonb_build_object('customerName', 'Rosa', 'x', coalesce(json_build_object('deep', 1), null)), 'driverId', d)`,
      ctx({ d: 'uuid' }),
    )
    expect(p.error).toBeNull()
    expect(p.top).toEqual(['amount', 'driverId'])
    expect([...p.todas].sort()).toEqual(['amount', 'customerName', 'deep', 'driverId', 'x'])
  })

  it('un constructor que no sabe analizar obliga a clasificar a mano', () => {
    for (const valor of [
      `to_jsonb(v_fila)`,
      `row_to_json(v_fila)`,
      `(select jsonb_agg(x) from t)`,
      `v_a || v_b`,
      `v_extra::jsonb`,
      `v_doc -> 'a'`,
      `jsonb_build_array(1)`,
    ])
      expect(leerPayload(`jsonb_build_object('amount', ${valor})`).error, valor).toMatch(
        /no analizable/,
      )
    expect(leerPayload(`v_payload`).error).toMatch(/no es un jsonb_build_object literal/)
    expect(leerPayload(`jsonb_build_object(v_k, 1)`).error).toMatch(/clave que no es un literal/)
    expect(leerPayload(`to_jsonb(v) || jsonb_build_object('a', 1)`).error).not.toBeNull()
    // Un escalar normal (campo de registro resuelto, literal, cast escalar) sí se acepta.
    expect(
      leerPayload(
        `jsonb_build_object('a', v.id, 'b', 'x', 'c', 1::numeric)`,
        ctx({ v: 'public.t' }, { 't.id': 'uuid' }),
      ).error,
    ).toBeNull()
  })

  it('(e) un constructor cualificado con pg_catalog o public se analiza igual que el simple', () => {
    // El ejemplo de la revisión de Codex: el `.` no puede esconder `customerName`.
    const p = leerPayload(
      `jsonb_build_object('amount', pg_catalog.jsonb_build_object('customerName','Rosa'), 'businessId', b, 'driverId', d)`,
      ctx({ b: 'uuid', d: 'uuid' }),
    )
    expect(p.error).toBeNull()
    expect(p.top).toEqual(['amount', 'businessId', 'driverId'])
    expect([...p.todas].sort()).toEqual(['amount', 'businessId', 'customerName', 'driverId'])
    const q = leerPayload(`pg_catalog.jsonb_build_object('a', public.json_build_object('b', 1))`)
    expect(q.error).toBeNull()
    expect(q.top).toEqual(['a'])
    expect([...q.todas].sort()).toEqual(['a', 'b'])
  })

  describe('lista de PERMITIDOS para los valores del payload', () => {
    const val = (valor: string, c = ctx({})) =>
      leerPayload(`jsonb_build_object('amount', ${valor})`, c).error

    it('(a) el auxiliar desconocido que devuelve un constructor con PII pide revisión manual', () => {
      // El ejemplo de Codex: `contact_json()` devuelve jsonb_build_object('customerName','Rosa').
      expect(val('contact_json()')).toMatch(/revisión manual/)
      expect(val('contact_json()')).toMatch(/contact_json/)
    })

    it('(b) la misma llamada cualificada (public., pg_catalog.) también', () => {
      expect(val('public.make_contact_json()')).toMatch(/revisión manual/)
      expect(val('pg_catalog.make_contact_json()')).toMatch(/revisión manual/)
      // Una función de usuario no se hace pasar por una de la lista cualificándola con public.
      expect(val('public.round(1, 2)')).toMatch(/revisión manual/)
    })

    it('(c) una variable jsonb usada como valor pide revisión manual', () => {
      const c = ctx({ v: 'jsonb', w: 'json', r: 'record', t: 'public.cash_settlements' })
      for (const x of ['v', 'w', 'r', 't', 'desconocida'])
        expect(val(x, c), x).toMatch(/revisión manual/)
    })

    it('(d) un parámetro jsonb pide revisión manual', () => {
      const c = ctx(argumentosDe('p_id uuid, p_data jsonb'))
      expect(val('p_data', c)).toMatch(/revisión manual/)
      expect(val('p_id', c)).toBeNull()
    })

    it('(e) variables y parámetros escalares se permiten', () => {
      const c = ctx({ v_amount: 'numeric(10,2)', p_by: 'uuid', p_for_debt: 'boolean' })
      expect(val('v_amount', c)).toBeNull()
      expect(val('p_by', c)).toBeNull()
      expect(val('p_for_debt', c)).toBeNull()
    })

    it('el campo de un registro solo vale si se resuelve que es escalar', () => {
      const campos = {
        'cash_settlements.delivered_amount': 'numeric',
        'cash_settlements.meta': 'jsonb',
      }
      const c = ctx({ v_cs: 'public.cash_settlements' }, campos)
      expect(val('v_cs.delivered_amount', c)).toBeNull()
      expect(val('v_cs.meta', c)).toMatch(/revisión manual/)
      expect(val('v_cs.no_existe', c)).toMatch(/revisión manual/)
      expect(val('v_otro.delivered_amount', c)).toMatch(/revisión manual/)
    })

    describe('tipos cualificados: solo pg_catalog o sin esquema valen como escalares', () => {
      // `CREATE DOMAIN public.text AS jsonb` haría pasar JSON por escalar si `public.` se quitara.
      it('(a) una variable `public.text` pide revisión manual', () => {
        expect(val('v', ctx({ v: 'public.text' }))).toMatch(/revisión manual/)
      })
      it('(b) un parámetro `public.text` pide revisión manual', () => {
        const c = ctx(argumentosDe('p public.text'))
        expect(val('p', c)).toMatch(/revisión manual/)
      })
      it('(c) un cast a `public.text` pide revisión manual, con :: y con CAST', () => {
        const c = ctx({ x: 'text' })
        expect(val('x::public.text', c)).toMatch(/revisión manual/)
        expect(val('cast(x as public.text)', c)).toMatch(/revisión manual/)
        expect(val('x::pg_catalog.text', c)).toBeNull()
        expect(val('cast(x as pg_catalog.text)', c)).toBeNull()
      })
      it('(d) una variable `pg_catalog.text` se permite', () => {
        expect(val('v', ctx({ v: 'pg_catalog.text' }))).toBeNull()
      })
      it('(e) una variable `text` se permite', () => {
        expect(val('v', ctx({ v: 'text' }))).toBeNull()
      })
      it('(f) el campo de un registro cuya columna es un dominio pide revisión manual', () => {
        // La consulta del catálogo informa `esquema.nombre` para todo tipo que no sea base de
        // pg_catalog (un dominio, o un tipo de otro esquema); aquí se simula esa salida.
        const campos = {
          'cash_settlements.nota': 'public.text',
          'cash_settlements.monto': 'numeric',
        }
        const c = ctx({ v_cs: 'public.cash_settlements' }, campos)
        expect(val('v_cs.nota', c)).toMatch(/revisión manual/)
        expect(val('v_cs.monto', c)).toBeNull()
      })
    })

    it('(f) round(...), now() y coalesce(...) de cosas permitidas se permiten', () => {
      const c = ctx({ v_amount: 'numeric', v_j: 'jsonb' })
      expect(val('pg_catalog.round(v_amount, 2)', c)).toBeNull()
      expect(val('round(v_amount, 2)', c)).toMatch(/revisión manual/)
      expect(val('now()', c)).toMatch(/revisión manual/)
      expect(val('pg_catalog.now()', c)).toBeNull()
      expect(val('coalesce(v_amount, 0)', c)).toBeNull()
      // ...pero no si un argumento no lo es.
      expect(val('coalesce(v_j, 0)', c)).toMatch(/revisión manual/)
      expect(val('round(contact_json(), 2)', c)).toMatch(/revisión manual/)
    })

    it('(h) shadowing: con DECLARE anidado no se resuelven tipos; con uno solo, sí', () => {
      const ins1 = (cuerpo: string) =>
        analizarFunciones([{ f: 'f_prueba', s: cuerpo }]).reales.get('f_prueba|x|Ev')?.error ?? null
      const insercion = `insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) values ('x', gen_random_uuid(), 'Ev', jsonb_build_object('amount', v))`
      const anidado = `declare v numeric; begin declare v jsonb := jsonb_build_object('customerName','Rosa'); begin ${insercion}; end; end;`
      expect(ins1(anidado)).toMatch(/DECLARE anidados/)
      expect(ins1(`declare v numeric; begin ${insercion}; end;`)).toBeNull()
    })

    it('(i) now/round solo escritas con pg_catalog.; sin esquema piden revisión sea cual sea proconfig', () => {
      const cuerpo = (llamada: string) =>
        `begin insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) values ('x', gen_random_uuid(), 'Ev', jsonb_build_object('amount', ${llamada})); end;`
      const err = (llamada: string, config?: string[] | null) =>
        analizarFunciones([{ f: 'f_prueba', s: cuerpo(llamada), config }]).reales.get(
          'f_prueba|x|Ev',
        )?.error ?? null
      // `set_config('search_path', …)` en el cuerpo anula el proconfig: ya no se confía en él.
      expect(err('round(1)', ['search_path=""'])).toMatch(/revisión manual/)
      expect(err('round(1)', ['search_path='])).toMatch(/revisión manual/)
      expect(err('round(1)', ['search_path=public, pg_catalog'])).toMatch(/revisión manual/)
      expect(err('now()', ['search_path=""'])).toMatch(/revisión manual/)
      expect(err('now()', null)).toMatch(/revisión manual/)
      expect(err('pg_catalog.round(1)', ['search_path=""'])).toBeNull()
      expect(err('pg_catalog.round(1)', null)).toBeNull()
      expect(err('pg_catalog.now()', null)).toBeNull()
      expect(err('coalesce(1, 2)', null)).toBeNull()
    })

    it('(k) ámbitos implícitos: bucles FOR/FOREACH y cursores piden revisión manual; un DECLARE simple, no', () => {
      const ins2 = (cuerpo: string) =>
        analizarFunciones([{ f: 'f_prueba', s: cuerpo }]).reales.get('f_prueba|x|Ev')?.error ?? null
      const insercion = (v: string) =>
        `insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) values ('x', gen_random_uuid(), 'Ev', jsonb_build_object('amount', ${v}))`
      // El ejemplo de Codex: dentro del bucle `v` se redeclara como record.
      const cursor = `declare v numeric; c cursor for select 'Rosa' as "customerName"; begin for v in c loop ${insercion('v')}; end loop; end;`
      expect(ins2(cursor)).toMatch(/revisión manual/)
      expect(
        ins2(`declare v numeric; begin for i in 1..3 loop ${insercion('i')}; end loop; end;`),
      ).toMatch(/revisión manual/)
      expect(
        ins2(
          `declare v numeric; begin for i in reverse 3..1 loop ${insercion('v')}; end loop; end;`,
        ),
      ).toMatch(/revisión manual/)
      expect(
        ins2(
          `declare v numeric; begin for r in select 1 as a loop ${insercion('v')}; end loop; end;`,
        ),
      ).toMatch(/revisión manual/)
      expect(
        ins2(
          `declare v numeric; begin for r in execute 'select 1' loop ${insercion('v')}; end loop; end;`,
        ),
      ).toMatch(/revisión manual/)
      expect(
        ins2(
          `declare v numeric; x text; begin foreach x in array array['a'] loop ${insercion('v')}; end loop; end;`,
        ),
      ).toMatch(/revisión manual/)
      expect(
        ins2(`declare v numeric; c refcursor; begin open c for select 1; ${insercion('v')}; end;`),
      ).toMatch(/revisión manual/)
      // El texto dentro de una cadena no cuenta.
      expect(
        ins2(`declare v numeric; begin perform 'for i in 1..3 loop'; ${insercion('v')}; end;`),
      ).toBeNull()
      // (f) un productor sencillo: un DECLARE, una variable numeric, sin bucles.
      expect(ins2(`declare v numeric(10,2) := 0; begin ${insercion('v')}; end;`)).toBeNull()
    })

    it('(j) el cast a un tipo escalar de algo permitido se permite; el de una variable json, no', () => {
      const c = ctx({ v_amount: 'numeric', v_json: 'jsonb' })
      expect(val('v_amount::text', c)).toBeNull()
      expect(val('cast(v_amount as text)', c)).toBeNull()
      expect(val('1::numeric', c)).toBeNull()
      expect(val('v_json::text', c)).toMatch(/revisión manual/)
      expect(val('cast(v_json as text)', c)).toMatch(/revisión manual/)
      expect(val('v_amount::jsonb', c)).toMatch(/revisión manual/)
      expect(val('v_amount::record', c)).toMatch(/revisión manual/)
    })

    it('literales y NULL se permiten; operadores y subselects, no', () => {
      const c = ctx({ a: 'numeric', b: 'numeric' })
      for (const x of [`'texto'`, '12', '-1.5', 'true', 'false', 'null', '(a)'])
        expect(val(x, c), x).toBeNull()
      for (const x of [
        'a + b',
        `a || 'x'`,
        '(select 1)',
        'case when a > 0 then 1 end',
        'a is null',
      ])
        expect(val(x, c), x).toMatch(/revisión manual/)
    })

    it('las variables se leen de DECLARE y de los argumentos de la función', () => {
      const cuerpo = `declare v_amount numeric(10,2) := 0; v_j jsonb; v_cs public.cash_settlements; begin insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) values ('cash_settlement', p_id, 'Ev', jsonb_build_object('a', v_amount, 'b', p_data, 'c', v_j, 'd', v_cs.id)); end`
      const r = analizarFunciones(
        [{ f: 'f_prueba', s: cuerpo, args: 'p_id uuid, p_data jsonb' }],
        new Map([['cash_settlements.id', 'uuid']]),
      )
      const real = r.reales.get('f_prueba|cash_settlement|Ev')
      expect(real?.error).toMatch(/p_data/)
      expect(real?.error).toMatch(/v_j/)
      expect(real?.error).not.toMatch(/v_amount|v_cs/)
    })
  })

  it('(f) un constructor cualificado de otro esquema se rechaza como opaco', () => {
    for (const q of ['miesquema.', 'extensions.', 'a.b.'])
      expect(
        leerPayload(`jsonb_build_object('amount', ${q}jsonb_build_object('customerName', 'Rosa'))`)
          .error,
        q,
      ).toMatch(/esquema/)
    expect(leerPayload(`otro.jsonb_build_object('a', 1)`).error).toMatch(/esquema/)
  })

  it('(g) los opacos cualificados con esquema también se rechazan', () => {
    for (const valor of [
      `pg_catalog.to_jsonb(x)`,
      `pg_catalog.row_to_json(x)`,
      `public.jsonb_agg(x)`,
      `pg_catalog.jsonb_build_array(1)`,
    ])
      expect(leerPayload(`jsonb_build_object('amount', ${valor})`).error, valor).toMatch(
        /no analizable/,
      )
  })

  it('(h) las cadenas con comas, paréntesis y comentarios falsos se leen enteras', () => {
    const p = leerPayload(
      String.raw`jsonb_build_object('a', $tag$Rosa, () -- /* ' $tag$, 'b', $$a,b$$, 'c', E'O\'Brien, (x)', 'd', E'barra\\', 'e', 'it''s, (y)')`,
    )
    expect(p.error).toBeNull()
    expect(p.top).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect([...p.todas]).toEqual(['a', 'b', 'c', 'd', 'e'])
    // Lo mismo pasa por la normalización completa de una inserción.
    const r = ins(
      String.raw`insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload) values ('x', gen_random_uuid(), 'Ev', jsonb_build_object('a', $tag$Rosa, () -- /* ' $tag$, 'c', E'O\'Brien, (x)')) ;`,
    )
    expect(r.problemas).toEqual([])
    expect([...(r.reales.get('f_prueba|x|Ev')?.top ?? [])]).toEqual(['a', 'c'])
  })

  it('(i) la normalización no toca el contenido de las cadenas', () => {
    expect(normalizarSql(`select '-- no es comentario' -- sí lo es\n, 'A  /* b */  C'`)).toBe(
      `select '-- no es comentario' , 'A  /* b */  C'`,
    )
    expect(
      normalizarSql(String.raw`SELECT E'O\'Brien -- x', $q$ Hola  "Mundo" /* y */ $q$ FROM T`),
    ).toBe(String.raw`select E'O\'Brien -- x', $q$ Hola  "Mundo" /* y */ $q$ from t`)
  })
})

// En la CI NO se salta: si falta Docker o el contenedor, el job debe ponerse rojo, no verde.
describe.skipIf(sinPsql && !process.env.CI)('candados con dos sesiones psql', () => {
  it('cada productor de eventos está inventariado y clasificado: uno nuevo, o con una clave nueva, obliga a decidir', async () => {
    // El borrado redacta `domain_events` por `aggregate_id` (pedido o carrera) y, para el resto,
    // por `event_type` + ids del payload. Un productor nuevo (o uno viejo que añada datos del
    // cliente al payload) puede dejar datos sin redactar: por eso se identifica CADA inserción
    // (función · agregado · evento · claves del payload) y se compara con el inventario de arriba.
    // Se leen TODAS las funciones de `public` que puedan mencionar la tabla (o armar SQL dinámico),
    // con su cuerpo normalizado: la detección es por mención, no por la forma del INSERT.
    // Basta que el cuerpo del PRODUCTOR mencione la tabla: ya no hace falta encontrar al auxiliar que
    // arme un payload, porque llamarlo desde un payload `sin_datos_del_cliente` falla por sí mismo.
    const r = await psql(
      `select coalesce(json_agg(json_build_object('f', f, 's', s, 'args', a, 'config', c) order by f), '[]') from (` +
        `select proname as f, coalesce(nullif(prosrc, ''), pg_get_function_sqlbody(oid)) as s, ` +
        `pg_get_function_arguments(oid) as a, proconfig as c from pg_proc ` +
        `where pronamespace = 'public'::regnamespace and prokind in ('f', 'p')) t ` +
        `where s ~* 'domain|events|execute'`,
    )
    const funciones = JSON.parse(r.out.trim()) as FuenteFuncion[]
    expect(funciones.length).toBeGreaterThan(0)
    // Tipos de las columnas de `public` (tabla.columna → tipo), para resolver `v_registro.campo`.
    // Solo un tipo BASE de `pg_catalog` se informa con su nombre (`format_type` omite el esquema);
    // un dominio o un tipo de otro esquema se informa como `esquema.nombre`, que `esTipoEscalar` rechaza.
    const cols = await psql(
      `select coalesce(json_object_agg(c.relname || '.' || a.attname, ` +
        `case when t.typnamespace = 'pg_catalog'::regnamespace and t.typtype = 'b' ` +
        `then format_type(a.atttypid, a.atttypmod) else t.typnamespace::regnamespace::text || '.' || t.typname end), '{}') ` +
        `from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped ` +
        `join pg_type t on t.oid = a.atttypid ` +
        `where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')`,
    )
    const campos = new Map(Object.entries(JSON.parse(cols.out.trim()) as Record<string, string>))
    expect(campos.size).toBeGreaterThan(0)
    const { reales, otras, problemas } = analizarFunciones(funciones, campos)
    expect(reales.size).toBeGreaterThan(0)
    for (const f of Object.keys(NO_INSERCIONES))
      if (!otras.has(f))
        problemas.push(`NO_INSERCIONES lista ${f} pero ya no menciona la tabla: actualízalo`)

    // Nada fuera del análisis: ni funciones de otro esquema, ni vistas o reglas que dependan de la tabla.
    const fuera = await psql(
      `select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace ` +
        `where n.nspname not in ('public', 'pg_catalog', 'information_schema') and p.prosrc ~* 'domain_events' ` +
        `union all select 'regla ' || r.rulename || ' sobre ' || r.ev_class::regclass from pg_depend d ` +
        `join pg_rewrite r on r.oid = d.objid where d.classid = 'pg_rewrite'::regclass ` +
        `and d.refobjid = 'public.domain_events'::regclass`,
    )
    for (const l of fuera.out.split(/\r?\n/).filter(Boolean))
      problemas.push(`${l} depende de domain_events y queda fuera del análisis`)

    // Lo que la redacción cubre, leído de la función VIVA y no de la migración.
    const del = await psql(
      `select prosrc from pg_proc where proname = 'delete_customer_account' and pronamespace = 'public'::regnamespace`,
    )
    const trozo = /update public\.domain_events set[^;]*;/.exec(normalizarSql(del.out))?.[0]
    expect(
      trozo,
      'no se encontró el UPDATE de domain_events en delete_customer_account',
    ).toBeTruthy()
    const agregadosCubiertos = new Set(
      [
        ...(/aggregate_type\s+in\s*\(([^)]*)\)/i.exec(trozo ?? '')?.[1] ?? '').matchAll(/'(\w+)'/g),
      ].map((m) => m[1] as string),
    )
    const eventosCubiertos = new Set(
      [...(trozo ?? '').matchAll(/event_type\s*=\s*'(\w+)'/gi)].map((m) => m[1] as string),
    )
    const clavesCubiertas = new Set(
      [...(trozo ?? '').matchAll(/payload\s*->>\s*'(\w+)'/gi)].map((m) => m[1] as string),
    )
    expect([...agregadosCubiertos].sort()).toEqual(['courier_order', 'order'])
    expect(eventosCubiertos.size).toBeGreaterThan(0)

    for (const [k, real] of reales) {
      const inv = INVENTARIO_PRODUCTORES[k]
      const [, agregado, evento] = k.split('|') as [string, string, string]
      if (!inv) {
        problemas.push(
          `productor NUEVO sin clasificar: ${k} claves=${[...real.todas].sort().join(',')}${real.error ? ` [${real.error}]` : ''}`,
        )
        continue
      }
      if (inv.n !== real.n)
        problemas.push(`${k}: ${real.n} inserciones y el inventario dice ${inv.n}`)
      if (inv.clase === 'por_aggregate') {
        if (!agregadosCubiertos.has(agregado))
          problemas.push(`${k}: es por_aggregate pero 0259 no redacta el agregado '${agregado}'`)
      } else if (inv.clase === 'por_payload_uuid') {
        if (!eventosCubiertos.has(evento))
          problemas.push(`${k}: es por_payload_uuid pero el filtro de 0259 no incluye '${evento}'`)
        if (!real.top || ![...real.top].some((c) => clavesCubiertas.has(c)))
          problemas.push(
            `${k}: ninguna clave del payload es una de las que busca el filtro (${[...clavesCubiertas].join(',')})`,
          )
      } else {
        if (real.error)
          problemas.push(
            `${k}: payload no analizable (${real.error}); clasifícalo a mano antes de inventariarlo`,
          )
        else {
          // Todas las claves, de todos los niveles: una anidada también es una clave nueva.
          const nuevas = [...real.todas].filter((c) => !inv.claves.includes(c))
          if (nuevas.length > 0)
            problemas.push(
              `${k}: clave(s) nueva(s) en el payload: ${nuevas.join(',')}; decide si llevan datos del cliente`,
            )
        }
      }
    }
    for (const k of Object.keys(INVENTARIO_PRODUCTORES))
      if (!reales.has(k)) problemas.push(`el inventario lista ${k} pero ya no existe: actualízalo`)
    // Todo evento que el filtro de 0259 busca por payload tiene un productor inventariado.
    for (const e of eventosCubiertos)
      if (
        !Object.entries(INVENTARIO_PRODUCTORES).some(
          ([k, v]) => v.clase === 'por_payload_uuid' && k.endsWith(`|${e}`),
        )
      )
        problemas.push(
          `el filtro de 0259 busca '${e}' pero el inventario no lo tiene como por_payload_uuid`,
        )

    expect(problemas).toEqual([])
  })

  it('guardar una dirección y borrar la cuenta a la vez: sin abrazo mortal (libreta primero)', async () => {
    const c = await crearCliente()
    await db.from('customer_addresses').insert({
      user_id: c.userId,
      label: 'Casa',
      line: 'Jr. Secreto 123',
      reference: 'x',
      coordinates_lat: -9.1465,
      coordinates_lng: -78.2779,
      is_default: true,
    })
    const a = psql(guardarDireccionComo(c.userId, 3))
    await sleep(1000)
    const b = psql(`select public.delete_customer_account('${c.userId}')`)
    const [ra, rb] = await Promise.all([a, b])
    expect(`${ra.err}${rb.err}`).not.toMatch(/deadlock/i)
    expect(ra.err).toBe('')
    expect(rb.out).toMatch(/"status": "deleted"/)
    expect(rb.ms).toBeGreaterThan(1500) // esperó a que la libreta terminara
  })

  it('al revés: el borrado primero, la dirección después, se rechaza sin abrazo mortal', async () => {
    const c = await crearCliente()
    await db.from('customer_addresses').insert({
      user_id: c.userId,
      label: 'Casa',
      line: 'Jr. Secreto 123',
      reference: 'x',
      coordinates_lat: -9.1465,
      coordinates_lng: -78.2779,
      is_default: true,
    })
    const b = psql(
      `begin; select public.delete_customer_account('${c.userId}'); select pg_sleep(3); commit;`,
    )
    await sleep(1000)
    const a = psql(guardarDireccionComo(c.userId, 0))
    const [rb, ra] = await Promise.all([b, a])
    expect(`${ra.err}${rb.err}`).not.toMatch(/deadlock/i)
    expect(rb.out).toMatch(/"status": "deleted"/)
    expect(ra.err).toMatch(/account was deleted/)
    const { count } = await db
      .from('customer_addresses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', c.userId)
    expect(count).toBe(0)
  })

  it('un pedido que llega mientras se borra espera y se rechaza al confirmarse el borrado', async () => {
    const c = await crearCliente()
    const seed = await seedContraentregaOrder()
    seeds.push(seed)
    const b = psql(
      `begin; select public.delete_customer_account('${c.userId}'); select pg_sleep(3); commit;`,
    )
    await sleep(1000)
    const a = psql(
      `insert into public.orders (business_id, short_id, customer_user_id, customer_name, order_amount, delivery_fee, payment_intent, status) ` +
        `values ('${seed.businessId}','RACE3333','${c.userId}','Rosa',10,2,'pending_cash','pending_acceptance')`,
    )
    const [rb, ra] = await Promise.all([b, a])
    expect(rb.out).toMatch(/"status": "deleted"/)
    expect(ra.err).toMatch(/account was deleted/)
    expect(ra.ms).toBeGreaterThan(1500)
    const { count } = await db
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('short_id', 'RACE3333')
    expect(count).toBe(0)
  })
  it('un UPDATE directo del perfil cruzado con el borrado: el borrado termina (con reintento) y no queda nada', async () => {
    const c = await crearCliente()
    const seed = await pedidoCompleto(c)
    // A (como /customer/phone/verify): bloquea la fila del perfil y, tras una pausa, hace el
    // UPDATE, cuyo guard pide `FOR SHARE` sobre `users`. Para entonces la RPC ya tiene `users`
    // FOR UPDATE y espera la fila del perfil: abrazo mortal de verdad. PostgreSQL aborta a uno
    // (40P01) y el otro sigue. Aquí el que cae es A (esperó el último); si cayera la RPC, la
    // ruta reintenta (ver `withTxRetry` y su prueba unitaria).
    const a = psql(
      `begin; select 1 from public.customer_profiles where user_id='${c.userId}' for update; ` +
        `select pg_sleep(4); ` +
        `update public.customer_profiles set phone_verified_at = now() where user_id='${c.userId}'; commit;`,
    )
    await sleep(1500)
    const respuesta = await borrar(c.token)
    const ra = await a
    expect(respuesta.status).toBe(204)
    expect(ra.err, 'el cruce debe producir un deadlock real').toMatch(/deadlock detected/)
    const { count } = await db
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', c.userId)
    expect(count).toBe(0)
    const { data: pedido } = await db
      .from('orders')
      .select('customer_name,customer_phone')
      .eq('id', seed.orderId)
      .single()
    expect(pedido).toEqual({ customer_name: 'Cuenta eliminada', customer_phone: null })
  })
})
