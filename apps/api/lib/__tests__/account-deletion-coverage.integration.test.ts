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
      { timeout: 60_000 },
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

// En la CI NO se salta: si falta Docker o el contenedor, el job debe ponerse rojo, no verde.
describe.skipIf(sinPsql && !process.env.CI)('candados con dos sesiones psql', () => {
  it('los productores de eventos son los inventariados: uno nuevo obliga a revisar la redacción', async () => {
    // El borrado localiza los eventos por `aggregate_id` (pedido o carrera) y, para los que
    // cuelgan de otro agregado, por `event_type` + ids del payload. Un productor nuevo que
    // no encaje aquí puede dejar datos del cliente sin redactar.
    const todas = String.raw`insert\s+into\s+public\.domain_events`
    const literales = String.raw`insert\s+into\s+public\.domain_events\s*\([^)]*\)\s*values\s*\(\s*'(\w+)',\s*[\w.]+,\s*'([^']+)'`
    const q = (re: string) => re.replaceAll("'", "''")
    const r = await psql(
      `select (select count(*) from pg_proc p cross join lateral regexp_matches(p.prosrc, '${q(todas)}', 'gi') x ` +
        `where p.pronamespace = 'public'::regnamespace) || '|' || ` +
        `coalesce((select string_agg(distinct m[1] || ':' || m[2], ',') from pg_proc p ` +
        `cross join lateral regexp_matches(p.prosrc, '${q(literales)}', 'gi') m ` +
        `where p.pronamespace = 'public'::regnamespace), '') || '|' || ` +
        `(select count(*) from pg_proc p cross join lateral regexp_matches(p.prosrc, '${q(literales)}', 'gi') m ` +
        `where p.pronamespace = 'public'::regnamespace)`,
    )
    const [nTodas, tipos, nLiterales] = r.out.trim().split('|')
    // Toda inserción tiene la forma (agregado literal, id, evento literal)…
    expect(Number(nTodas)).toBeGreaterThan(0)
    expect(nLiterales).toBe(nTodas)
    // …y los agregados son solo estos. Los de `cash_settlement` y `business` no cuelgan de un
    // pedido; solo `CashDelivered` lleva dentro un `orderId` (y por eso se busca por tipo).
    const lista = (tipos ?? '').split(',')
    expect([...new Set(lista.map((t) => t.split(':')[0]))].sort()).toEqual([
      'business',
      'cash_settlement',
      'courier_order',
      'order',
    ])
    expect(lista.filter((t) => t.startsWith('cash_settlement:')).sort()).toEqual([
      'cash_settlement:CashConfirmed',
      'cash_settlement:CashDelivered',
      'cash_settlement:CashDisputed',
      'cash_settlement:CashResolved',
    ])
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
