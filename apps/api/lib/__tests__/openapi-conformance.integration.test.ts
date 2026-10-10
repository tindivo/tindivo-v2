/**
 * CONFORMIDAD DEL OPENAPI: cada operación del cliente, contra su respuesta real.
 *
 * El registro de `@tindivo/contracts/openapi` describe las 27 operaciones que
 * usan las apps del cliente, y de ese documento saldrán los modelos de Swift y
 * Kotlin. Aquí se llama a cada route handler con un `Request` real y un JWT
 * real, contra la base local sembrada (`db:seed:e2e`), y la respuesta se pasa
 * por `expectConforms`: si la ruta manda un `null` donde el documento promete
 * un valor, o un campo que el documento no dice, el test lo nombra.
 *
 * El último caso obliga a que NINGUNA operación documentada se quede sin
 * comprobar: registrar una ruta nueva sin traerla aquí rompe este fichero.
 *
 * Mundo propio, barrido por `vitest.global-setup.ts` si la corrida muere:
 *  · un cliente `Vecino Conformidad` con teléfono propio de esta corrida;
 *  · sus pedidos van al negocio e2e (que NO se borra), así que el barrido los
 *    encuentra por `customer_user_id`, y su apelación por `created_by`;
 *  · un artículo de Store con el prefijo `ZZ Test Store`.
 */
import { createClient } from '@supabase/supabase-js'
import { OPERATIONS } from '@tindivo/contracts/openapi'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import { localClient as db, E2E } from './helpers/local-db'
import { COURIER_POINT_A, COURIER_POINT_B } from './helpers/local-db-courier'
import { checkedOperations, expectConforms } from './helpers/openapi-conformance'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

import { POST as adminStoreImage } from '../../app/api/v1/admin/store/[id]/images/route'
import { PATCH as adminStorePatch } from '../../app/api/v1/admin/store/[id]/route'
import { POST as adminStoreStatus } from '../../app/api/v1/admin/store/[id]/status/route'
import { POST as adminStoreCreate } from '../../app/api/v1/admin/store/route'
import { GET as listAppeals } from '../../app/api/v1/customer/appeals/route'
import { POST as cancelCourierOrder } from '../../app/api/v1/customer/courier-orders/[id]/cancel/route'
import { POST as createCourierOrder } from '../../app/api/v1/customer/courier-orders/route'
import {
  POST as createOrderAppeal,
  GET as getOrderAppeal,
} from '../../app/api/v1/customer/orders/[id]/appeal/route'
import { POST as cancelOrder } from '../../app/api/v1/customer/orders/[id]/cancel/route'
import { GET as getPrepayInfo } from '../../app/api/v1/customer/orders/[id]/prepay-info/route'
import { POST as confirmPrepayProof } from '../../app/api/v1/customer/orders/[id]/prepay-proof/route'
import { POST as createOrder } from '../../app/api/v1/customer/orders/route'
import { POST as sendPhoneCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as verifyPhoneCode } from '../../app/api/v1/customer/phone/verify/route'
import { GET as getHealth } from '../../app/api/v1/health/route'
import { GET as getBusiness } from '../../app/api/v1/public/businesses/[id]/route'
import { GET as listBusinesses } from '../../app/api/v1/public/businesses/route'
import { GET as getCourierTracking } from '../../app/api/v1/public/courier/[shortId]/route'
import { GET as getCourierServiceStatus } from '../../app/api/v1/public/courier/status/route'
import { GET as getOrderTracking } from '../../app/api/v1/public/orders/[shortId]/route'
import { POST as checkPilotAccess } from '../../app/api/v1/public/pilot-access/route'
import { GET as getOrderIntakeStatus } from '../../app/api/v1/public/schedule/route'
import { GET as searchCatalog } from '../../app/api/v1/public/search/route'
import { GET as getStoreProduct } from '../../app/api/v1/public/store/[slug]/route'
import { POST as trackStoreEvent } from '../../app/api/v1/public/store/events/route'
import { GET as listStoreProducts } from '../../app/api/v1/public/store/route'
import { GET as getMyPushSubscription } from '../../app/api/v1/push/subscriptions/me/route'
import {
  POST as createPushSubscription,
  DELETE as deletePushSubscription,
  GET as listPushSubscriptions,
} from '../../app/api/v1/push/subscriptions/route'
import { DEV_OTP_CODE } from '../twilio/client'

// biome-ignore lint/suspicious/noExplicitAny: las tablas de Store aún no están en database.types.ts
const sdb = db as any

/** Lo barre `vitest.global-setup.ts` (USUARIOS_FIXTURE) si la corrida muere. */
const NOMBRE_FIXTURE = 'Vecino Conformidad'
/** Teléfono de esta corrida: hay índice único sobre el verificado. */
const TELEFONO = `9${String(Date.now()).slice(-8)}`
const RUN = Math.random().toString(36).slice(2, 10)
const PUSH_ENDPOINT = `https://fcm.googleapis.com/fcm/send/conformidad-${RUN}`
const STORE_SESSION = `conformidad-${RUN}`

let userId = ''
let token = ''
let adminToken = ''
let courierSettings: unknown = null
const storeProducts: string[] = []

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

/** Llama al handler y devuelve el estado y el cuerpo ya parseado (o `null` si no hay). */
async function call(
  handler: Handler | ((req: Request) => Promise<Response> | Response),
  opts: {
    method?: string
    body?: unknown
    params?: Record<string, string>
    qs?: string
    bearer?: string
    headers?: Record<string, string>
  } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers }
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`
  const res = await (handler as Handler)(
    new Request(`http://localhost:3001/api/v1/x${opts.qs ?? ''}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: Promise.resolve(opts.params ?? {}) },
  )
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

/** Llama y exige que la respuesta cumpla su esquema. Devuelve el cuerpo sin envoltura. */
async function conforms(
  operationId: string,
  expectedStatus: number,
  handler: Parameters<typeof call>[0],
  opts: Parameters<typeof call>[1] = {},
): Promise<Record<string, unknown>> {
  const { status, body } = await call(handler, opts)
  if (status !== expectedStatus) {
    throw new Error(
      `${operationId}: se esperaba ${expectedStatus} y llegó ${status}: ${JSON.stringify(body)}`,
    )
  }
  expectConforms(operationId, status, body)
  const op = OPERATIONS.find((o) => o.operationId === operationId)
  const envelope = op?.success[status]?.envelope
  return (envelope === 'data' ? (body as { data: unknown }).data : body) as Record<string, unknown>
}

async function signIn(email: string, password: string): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`entrar como ${email} falló: ${error?.message}`)
  return data.session.access_token
}

/** Lo que el cliente pide en todos los casos: un pollo con extra queso, para recoger luego. */
const orderBody = () => ({
  businessId: E2E.BUSINESS_ID,
  deliveryMethod: 'pickup',
  pickupTiming: 'later',
  paymentIntent: 'prepaid',
  customerName: NOMBRE_FIXTURE,
  customerPhone: TELEFONO,
  items: [
    { menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 1, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
  ],
})

async function borrarPedidosDelCliente(): Promise<void> {
  const { data: pedidos } = await db.from('orders').select('id').eq('customer_user_id', userId)
  const ids = (pedidos ?? []).map((p) => p.id)
  if (ids.length === 0) return
  await db.from('reports').delete().in('order_id', ids)
  await db.from('business_charges').delete().in('order_id', ids)
  await db.from('domain_events').delete().in('aggregate_id', ids)
  await db.from('orders').delete().in('id', ids)
}

beforeAll(async () => {
  const email = `conformidad-${RUN}@integration.local`
  const password = 'test-password-12345'
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_FIXTURE },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  userId = data.user.id
  // `public.users` y el rol los pone `handle_new_user`; el perfil lo crea la
  // app (ver `otp-dev-simulation`), y sin él `send-code` sellaría cero filas.
  const { error: perfilErr } = await db
    .from('customer_profiles')
    .insert({ user_id: userId, full_name: NOMBRE_FIXTURE })
  if (perfilErr) throw new Error(`crear el perfil falló: ${perfilErr.message}`)
  token = await signIn(email, password)
  adminToken = await signIn(FIXTURES.ADMIN_EMAIL, FIXTURES.PASSWORD)

  // Entregas: encendido y sin horario, solo mientras dura este fichero.
  const { data: courier } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  courierSettings = courier?.value ?? null
  const value = {
    ...(courierSettings as Record<string, unknown>),
    enabled: true,
    ignoreSchedule: true,
    hours: { start: '00:00', end: '23:59' },
  }
  await db.from('app_settings').update({ value }).eq('key', 'courier')
})

afterAll(async () => {
  if (courierSettings) {
    await db
      .from('app_settings')
      .update({ value: courierSettings as never })
      .eq('key', 'courier')
  }
  if (storeProducts.length > 0) await sdb.from('store_products').delete().in('id', storeProducts)
  await sdb.from('store_events').delete().eq('session_id', STORE_SESSION)
  await db.from('push_subscriptions').delete().eq('endpoint', PUSH_ENDPOINT)
  if (!userId) return
  await borrarPedidosDelCliente()
  await db.from('courier_orders').delete().eq('customer_user_id', userId)
  await db.from('users').delete().eq('id', userId)
  await db.auth.admin.deleteUser(userId)
})

describe('rutas públicas', () => {
  it('sistema, horario, búsqueda y piloto', async () => {
    await conforms('getHealth', 200, getHealth)
    await conforms('getOrderIntakeStatus', 200, getOrderIntakeStatus)
    await conforms('searchCatalog', 200, searchCatalog, { qs: '?q=pollo' })
    await conforms('checkPilotAccess', 200, checkPilotAccess, { method: 'POST', body: {} })
    await conforms('getCourierServiceStatus', 200, getCourierServiceStatus)
  })

  it('el catálogo: la lista y un negocio con su carta y sus modificadores', async () => {
    const list = (await conforms('listBusinesses', 200, listBusinesses)) as unknown as unknown[]
    expect(list.length).toBeGreaterThan(0)
    const detail = await conforms('getBusiness', 200, getBusiness, {
      params: { id: E2E.BUSINESS_ID },
    })
    // El seed trae un plato con grupo de modificadores: si no llega, el
    // esquema de los modificadores no se está midiendo.
    const items = (detail.categories as { items: { modifier_groups: unknown[] }[] }[]).flatMap(
      (c) => c.items,
    )
    expect(items.some((i) => i.modifier_groups.length > 0)).toBe(true)
  })

  it('Tindivo Store: la grilla, el detalle y un evento', async () => {
    const draft = await call(adminStoreCreate, { method: 'POST', bearer: adminToken })
    expect(draft.status).toBe(201)
    const id = (draft.body as { data: { id: string } }).data.id
    storeProducts.push(id)
    const photo = {
      url: `${LOCAL_URL}/storage/v1/object/public/store-products/${id}/0.webp`,
      thumbUrl: `${LOCAL_URL}/storage/v1/object/public/store-products/${id}/0-t.webp`,
    }
    expect(
      (
        await call(adminStoreImage, {
          method: 'POST',
          params: { id },
          body: photo,
          bearer: adminToken,
        })
      ).status,
    ).toBe(201)
    const { data: cats } = await sdb.from('store_categories').select('id,slug')
    const ropa = (cats as { id: string; slug: string }[]).find((c) => c.slug === 'ropa')
    expect(
      (
        await call(adminStorePatch, {
          method: 'PATCH',
          params: { id },
          bearer: adminToken,
          body: {
            title: 'ZZ Test Store Casaca conformidad',
            price: 30,
            originalPrice: 60,
            categoryId: ropa?.id,
            condition: 'used',
            conditionScore: 9,
            sizeLabel: 'M',
          },
        })
      ).status,
    ).toBe(200)
    const published = await call(adminStoreStatus, {
      method: 'POST',
      params: { id },
      bearer: adminToken,
      body: { status: 'available' },
    })
    expect(published.status).toBe(200)
    const slug = (published.body as { data: { product: { slug: string } } }).data.product.slug

    const list = await conforms('listStoreProducts', 200, listStoreProducts)
    expect((list.products as unknown[]).length).toBeGreaterThan(0)
    await conforms('getStoreProduct', 200, getStoreProduct, { params: { slug } })
    await conforms('trackStoreEvent', 204, trackStoreEvent, {
      method: 'POST',
      body: { type: 'view_product', sessionId: STORE_SESSION, productId: id },
    })
  })
})

describe('el cliente con sesión', () => {
  it('verifica su teléfono (simulacro local de OTP)', async () => {
    const sent = await conforms('sendPhoneCode', 200, sendPhoneCode, {
      method: 'POST',
      bearer: token,
      body: { phone: TELEFONO },
    })
    expect(sent.verified).toBe(true)
    await conforms('verifyPhoneCode', 200, verifyPhoneCode, {
      method: 'POST',
      bearer: token,
      body: { phone: TELEFONO, code: DEV_OTP_CODE },
    })
  })

  it('pide, sigue y cancela un pedido', async () => {
    const created = await conforms('createOrder', 201, createOrder, {
      method: 'POST',
      bearer: token,
      headers: { 'idempotency-key': `conformidad-${RUN}-1` },
      body: orderBody(),
    })
    await conforms('getOrderTracking', 200, getOrderTracking, {
      params: { shortId: String(created.shortId) },
    })
    await conforms('cancelOrder', 200, cancelOrder, {
      method: 'POST',
      bearer: token,
      params: { id: String(created.id) },
    })
  })

  it('prepaga, manda el comprobante y apela el rechazo', async () => {
    const created = await conforms('createOrder', 201, createOrder, {
      method: 'POST',
      bearer: token,
      headers: { 'idempotency-key': `conformidad-${RUN}-2` },
      body: orderBody(),
    })
    const id = String(created.id)
    // El negocio aceptó y toca pagar: se pone a mano, como en el resto de la
    // suite, porque aceptar es de otro rol y no es lo que se mide aquí.
    await db.from('orders').update({ status: 'awaiting_payment' }).eq('id', id)

    await conforms('getPrepayInfo', 200, getPrepayInfo, { bearer: token, params: { id } })
    await conforms('confirmPrepayProof', 200, confirmPrepayProof, {
      method: 'POST',
      bearer: token,
      params: { id },
      body: { path: `${userId}/conformidad-${RUN}.webp` },
    })

    // La cajera lo rechazó por última vez: es lo único que se puede apelar.
    await db
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: 'proof_rejected_final',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
    await conforms('createOrderAppeal', 200, createOrderAppeal, {
      method: 'POST',
      bearer: token,
      params: { id },
      body: { description: 'Sí pagué, adjunto la captura' },
    })
    await conforms('getOrderAppeal', 200, getOrderAppeal, { bearer: token, params: { id } })
    const appeals = await conforms('listAppeals', 200, listAppeals, { bearer: token })
    expect(appeals.total).toBe(1)
  })

  it('pide, sigue y cancela una entrega', async () => {
    const created = await conforms('createCourierOrder', 201, createCourierOrder, {
      method: 'POST',
      bearer: token,
      headers: { 'idempotency-key': `conformidad-${RUN}-courier` },
      body: {
        requesterName: NOMBRE_FIXTURE,
        requesterPhone: TELEFONO,
        origin: {
          contactName: 'Bodega de prueba',
          coordinates: COURIER_POINT_A,
          referenceText: 'Frente al parque, prueba de conformidad',
        },
        destination: {
          contactName: NOMBRE_FIXTURE,
          contactPhone: TELEFONO,
          coordinates: COURIER_POINT_B,
          referenceText: 'Casa de dos pisos, prueba de conformidad',
        },
        itemDescription: 'Un paquete de prueba',
        isFragile: false,
        readyInMin: 0,
        payer: 'destination',
        weightConfirmed: true,
        prepaidConfirmed: true,
      },
    })
    await conforms('getCourierTracking', 200, getCourierTracking, {
      params: { shortId: String(created.shortId) },
    })
    await conforms('cancelCourierOrder', 200, cancelCourierOrder, {
      method: 'POST',
      bearer: token,
      params: { id: String(created.id) },
    })
  })

  it('se suscribe a los avisos, se lista, se reconoce y se da de baja', async () => {
    await conforms('createPushSubscription', 201, createPushSubscription, {
      method: 'POST',
      bearer: token,
      body: {
        endpoint: PUSH_ENDPOINT,
        keys: { p256dh: 'p256dh-de-prueba', auth: 'auth-de-prueba' },
        userAgent: 'Conformidad',
        installId: `install-${RUN}`,
      },
    })
    const qs = `?endpoint=${encodeURIComponent(PUSH_ENDPOINT)}`
    const list = await conforms('listPushSubscriptions', 200, listPushSubscriptions, {
      bearer: token,
      qs,
    })
    expect(list.devices).toHaveLength(1)
    await conforms('getMyPushSubscription', 200, getMyPushSubscription, { bearer: token, qs })
    const removed = await conforms('deletePushSubscription', 200, deletePushSubscription, {
      method: 'DELETE',
      bearer: token,
      body: { endpoint: PUSH_ENDPOINT },
    })
    expect(removed.removed).toBe(1)
  })
})

describe('cobertura', () => {
  it('ninguna operación documentada se queda sin comprobar contra su ruta', () => {
    const documented = OPERATIONS.filter((op) => op.documented).map((op) => op.operationId)
    expect(documented.filter((id) => !checkedOperations().has(id))).toEqual([])
  })
})
