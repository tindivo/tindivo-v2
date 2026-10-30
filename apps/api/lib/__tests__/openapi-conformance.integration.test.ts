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
import {
  CustomerSecurityNoticesSchema,
  PhoneTransferSchema,
  ProblemDetailsSchema,
} from '@tindivo/contracts'
import { OPERATIONS } from '@tindivo/contracts/openapi'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import {
  cleanup,
  localClient as db,
  E2E,
  seedContraentregaOrder,
  uploadProofObject,
} from './helpers/local-db'
import { COURIER_POINT_A, COURIER_POINT_B } from './helpers/local-db-courier'
import { checkedOperations, expectConforms } from './helpers/openapi-conformance'
import { cleanupPhoneSecurityFixtures } from './helpers/phone-security-fixtures'

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
import { GET as getClientConfig } from '../../app/api/v1/config/route'
import { DELETE as deleteCustomerAccount } from '../../app/api/v1/customer/account/route'
import {
  DELETE as deleteCustomerAddress,
  PATCH as updateCustomerAddress,
} from '../../app/api/v1/customer/addresses/[id]/route'
import {
  POST as createCustomerAddress,
  GET as listCustomerAddresses,
} from '../../app/api/v1/customer/addresses/route'
import { GET as listAppeals } from '../../app/api/v1/customer/appeals/route'
import { POST as quoteCheckout } from '../../app/api/v1/customer/checkout/quote/route'
import { POST as cancelCourierOrder } from '../../app/api/v1/customer/courier-orders/[id]/cancel/route'
import {
  POST as createCourierOrder,
  GET as listCustomerCourierOrders,
} from '../../app/api/v1/customer/courier-orders/route'
import {
  POST as createOrderAppeal,
  GET as getOrderAppeal,
} from '../../app/api/v1/customer/orders/[id]/appeal/route'
import { POST as cancelOrder } from '../../app/api/v1/customer/orders/[id]/cancel/route'
import { GET as getPrepayInfo } from '../../app/api/v1/customer/orders/[id]/prepay-info/route'
import { POST as confirmPrepayProof } from '../../app/api/v1/customer/orders/[id]/prepay-proof/route'
import { POST as createPrepayProofUploadUrl } from '../../app/api/v1/customer/orders/[id]/prepay-proof/upload-url/route'
import { GET as getCustomerReorder } from '../../app/api/v1/customer/orders/[id]/reorder/route'
import { POST as dismissCustomerReview } from '../../app/api/v1/customer/orders/[id]/review/dismiss/route'
import { POST as createCustomerReview } from '../../app/api/v1/customer/orders/[id]/review/route'
import { GET as getCustomerOrder } from '../../app/api/v1/customer/orders/[id]/route'
import { GET as getOrderAttempt } from '../../app/api/v1/customer/orders/attempts/[key]/route'
import {
  POST as createOrder,
  GET as listCustomerOrders,
} from '../../app/api/v1/customer/orders/route'
import { GET as getPaymentOptions } from '../../app/api/v1/customer/payment-options/route'
import { POST as sendPhoneCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as transferPhone } from '../../app/api/v1/customer/phone/transfer/route'
import { POST as verifyPhoneCode } from '../../app/api/v1/customer/phone/verify/route'
import {
  GET as getCustomerProfile,
  PUT as updateCustomerProfile,
} from '../../app/api/v1/customer/profile/route'
import { GET as getCustomerPendingReview } from '../../app/api/v1/customer/reviews/pending/route'
import { POST as seeSecurityNotice } from '../../app/api/v1/customer/security-notices/[id]/seen/route'
import { GET as getSecurityNotices } from '../../app/api/v1/customer/security-notices/route'
import { POST as acceptTerms } from '../../app/api/v1/customer/terms-acceptance/route'
import { GET as getHealth } from '../../app/api/v1/health/route'
import { GET as getBusiness } from '../../app/api/v1/public/businesses/[id]/route'
import { GET as listBusinesses } from '../../app/api/v1/public/businesses/route'
import { GET as getPublicConfig } from '../../app/api/v1/public/config/route'
import { GET as getCourierTracking } from '../../app/api/v1/public/courier/[shortId]/route'
import { GET as listCourierDirectory } from '../../app/api/v1/public/courier/directory/route'
import { GET as getCourierServiceStatus } from '../../app/api/v1/public/courier/status/route'
import { GET as listMapLandmarks } from '../../app/api/v1/public/landmarks/route'
import { GET as getOrderTracking } from '../../app/api/v1/public/orders/[shortId]/route'
import { POST as checkPilotAccess } from '../../app/api/v1/public/pilot-access/route'
import { GET as getOrderIntakeStatus } from '../../app/api/v1/public/schedule/route'
import { GET as searchCatalog } from '../../app/api/v1/public/search/route'
import { GET as getStoreProduct } from '../../app/api/v1/public/store/[slug]/route'
import { POST as trackStoreEvent } from '../../app/api/v1/public/store/events/route'
import { GET as listStoreProducts } from '../../app/api/v1/public/store/route'
import {
  PUT as registerPushDevice,
  DELETE as unregisterPushDevice,
} from '../../app/api/v1/push/devices/[installId]/route'
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
  await db.from('phone_transfer_challenges').delete().eq('user_id', userId).throwOnError()
  await db.from('phone_assignments').delete().eq('user_id', userId).throwOnError()
  await db.from('users').delete().eq('id', userId)
  await db.auth.admin.deleteUser(userId)
})

describe('rutas públicas', () => {
  it('sistema, horario, búsqueda y piloto', async () => {
    await conforms('getHealth', 200, getHealth)
    await conforms('getClientConfig', 200, getClientConfig)
    await conforms('getOrderIntakeStatus', 200, getOrderIntakeStatus)
    await conforms('searchCatalog', 200, searchCatalog, { qs: '?q=pollo' })
    await conforms('checkPilotAccess', 200, checkPilotAccess, { method: 'POST', body: {} })
    await conforms('getCourierServiceStatus', 200, getCourierServiceStatus)
  })

  it('MV4a: configuración pública, referencias del mapa y directorio', async () => {
    await conforms('getPublicConfig', 200, getPublicConfig)
    await conforms('listMapLandmarks', 200, listMapLandmarks)
    await conforms('listCourierDirectory', 200, listCourierDirectory)
  })

  it('MV4a: perfil y opciones de pago del cliente', async () => {
    await conforms('updateCustomerProfile', 200, updateCustomerProfile, {
      method: 'PUT',
      bearer: token,
      body: { fullName: NOMBRE_FIXTURE },
    })
    // El perfil de este fichero se creó sin teléfono: `phone` y `phoneVerifiedAt` salen null.
    const profile = await conforms('getCustomerProfile', 200, getCustomerProfile, { bearer: token })
    expect(profile.fullName).toBe(NOMBRE_FIXTURE)
    await conforms('getPaymentOptions', 200, getPaymentOptions, { bearer: token })
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

  it('D-55: el plato con miniatura la devuelve y el que no la tiene la deja en null, y ambos cumplen el esquema', async () => {
    const THUMB = `${LOCAL_URL}/storage/v1/object/public/menu-items/${E2E.BUSINESS_ID}/items/zz-t?v=1`
    type Item = { id: string; thumbnail_url?: string | null }
    const itemsDe = (detail: Record<string, unknown>) =>
      (detail.categories as { items: Item[] }[]).flatMap((c) => c.items)
    // Los platos que de verdad salen en la carta pública (categoría activa).
    const visibles = itemsDe(
      await conforms('getBusiness', 200, getBusiness, { params: { id: E2E.BUSINESS_ID } }),
    ).map((i) => i.id)
    expect(visibles.length).toBeGreaterThanOrEqual(2)
    const [conMiniatura, sinMiniatura] = visibles as [string, string]
    try {
      await sdb
        .from('menu_items')
        .update({ thumbnail_url: null })
        .eq('business_id', E2E.BUSINESS_ID)
      await sdb.from('menu_items').update({ thumbnail_url: THUMB }).eq('id', conMiniatura)
      const items = itemsDe(
        await conforms('getBusiness', 200, getBusiness, { params: { id: E2E.BUSINESS_ID } }),
      )
      expect(items.find((i) => i.id === conMiniatura)?.thumbnail_url).toBe(THUMB)
      // Sin miniatura: la API la manda null (el esquema también admite que falte).
      const sin = items.find((i) => i.id === sinMiniatura)
      expect(sin).toBeDefined()
      expect(sin?.thumbnail_url ?? null).toBeNull()
    } finally {
      await sdb.from('menu_items').update({ thumbnail_url: null }).eq('id', conMiniatura)
    }
  })

  it('D-55: la búsqueda devuelve la miniatura del plato y null si no la tiene, y cumple el esquema', async () => {
    const THUMB = `${LOCAL_URL}/storage/v1/object/public/menu-items/${E2E.BUSINESS_ID}/items/zz-s?v=1`
    type Item = {
      id: string
      name: string
      is_available: boolean
      available_days?: unknown
      available_from?: string | null
      available_to?: string | null
    }
    // La búsqueda solo trae platos disponibles y dentro de su franja: se eligen
    // platos sin franja para que la hora a la que corre la CI no cuente.
    const platos = (
      (await conforms('getBusiness', 200, getBusiness, { params: { id: E2E.BUSINESS_ID } }))
        .categories as { items: Item[] }[]
    )
      .flatMap((c) => c.items)
      .filter(
        (i) =>
          i.is_available &&
          i.name.trim().length >= 2 &&
          i.available_days == null &&
          i.available_from == null &&
          i.available_to == null,
      )
    expect(platos.length).toBeGreaterThanOrEqual(2)
    const [conMiniatura, sinMiniatura] = platos as [Item, Item]
    const buscar = async (nombre: string) =>
      (
        (await conforms('searchCatalog', 200, searchCatalog, {
          qs: `?q=${encodeURIComponent(nombre)}`,
        })) as unknown as { items: { id: string; thumbnail_url?: string | null }[] }
      ).items
    try {
      await sdb
        .from('menu_items')
        .update({ thumbnail_url: null })
        .eq('business_id', E2E.BUSINESS_ID)
      await sdb.from('menu_items').update({ thumbnail_url: THUMB }).eq('id', conMiniatura.id)
      const con = (await buscar(conMiniatura.name)).find((i) => i.id === conMiniatura.id)
      expect(con?.thumbnail_url).toBe(THUMB)
      const sin = (await buscar(sinMiniatura.name)).find((i) => i.id === sinMiniatura.id)
      expect(sin).toBeDefined()
      expect(sin?.thumbnail_url ?? null).toBeNull()
    } finally {
      await sdb
        .from('menu_items')
        .update({ thumbnail_url: null })
        .eq('business_id', E2E.BUSINESS_ID)
    }
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
    const attemptKey = crypto.randomUUID()
    const created = await conforms('createOrder', 201, createOrder, {
      method: 'POST',
      bearer: token,
      headers: { 'idempotency-key': attemptKey },
      body: orderBody(),
    })
    const attempt = await conforms('getOrderAttempt', 200, getOrderAttempt, {
      bearer: token,
      params: { key: attemptKey },
    })
    expect(attempt.state).toBe('created')
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
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: orderBody(),
    })
    const id = String(created.id)
    // El negocio aceptó y toca pagar: se pone a mano, como en el resto de la
    // suite, porque aceptar es de otro rol y no es lo que se mide aquí.
    await db.from('orders').update({ status: 'awaiting_payment' }).eq('id', id)

    await conforms('getPrepayInfo', 200, getPrepayInfo, { bearer: token, params: { id } })
    await conforms('createPrepayProofUploadUrl', 200, createPrepayProofUploadUrl, {
      method: 'POST',
      bearer: token,
      params: { id },
      body: { contentType: 'image/png' },
    })
    await conforms('confirmPrepayProof', 200, confirmPrepayProof, {
      method: 'POST',
      bearer: token,
      params: { id },
      body: { path: await uploadProofObject(userId, id, 1, RUN) },
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
      headers: { 'idempotency-key': crypto.randomUUID() },
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

  it('MV7a: registra el dispositivo nativo y lo da de baja', async () => {
    const installId = crypto.randomUUID()
    const registered = await conforms('registerPushDevice', 200, registerPushDevice, {
      method: 'PUT',
      bearer: token,
      params: { installId },
      body: {
        platform: 'ios',
        app: 'customer',
        token: `conformidad-${RUN}-${'t'.repeat(40)}`,
        appVersion: '1.0.0',
        notificationsEnabled: true,
      },
    })
    expect(registered.installId).toBe(installId)
    await conforms('unregisterPushDevice', 204, unregisterPushDevice, {
      method: 'DELETE',
      bearer: token,
      params: { installId },
    })
  })

  it('MV4b: cotiza, guarda direcciones, lee su historial y acepta los términos', async () => {
    const quote = await conforms('quoteCheckout', 200, quoteCheckout, {
      method: 'POST',
      bearer: token,
      body: {
        businessId: E2E.BUSINESS_ID,
        deliveryMethod: 'delivery',
        coordinates: COURIER_POINT_A,
        items: [{ menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 2 }],
      },
    })
    expect(quote.total).toMatch(/^\d+\.\d{2}$/)

    const created = await conforms('createCustomerAddress', 201, createCustomerAddress, {
      method: 'POST',
      bearer: token,
      body: {
        label: 'Casa',
        line: 'Jr. Conformidad 123',
        reference: 'Casa verde, prueba de conformidad',
        coordinates: COURIER_POINT_B,
        accuracyM: 12,
      },
    })
    const addressId = String(created.id)
    await conforms('listCustomerAddresses', 200, listCustomerAddresses, { bearer: token })
    await conforms('updateCustomerAddress', 200, updateCustomerAddress, {
      method: 'PATCH',
      bearer: token,
      params: { id: addressId },
      body: { label: 'Trabajo' },
    })
    await conforms('deleteCustomerAddress', 204, deleteCustomerAddress, {
      method: 'DELETE',
      bearer: token,
      params: { id: addressId },
    })

    const orders = await conforms('listCustomerOrders', 200, listCustomerOrders, { bearer: token })
    const first = (orders.items as { id: string }[])[0]
    expect(first).toBeDefined()
    await conforms('getCustomerOrder', 200, getCustomerOrder, {
      bearer: token,
      params: { id: String(first?.id) },
    })
    await conforms('getCustomerReorder', 200, getCustomerReorder, {
      bearer: token,
      params: { id: String(first?.id) },
    })
    const courier = await conforms('listCustomerCourierOrders', 200, listCustomerCourierOrders, {
      bearer: token,
    })
    expect((courier.items as unknown[]).length).toBeGreaterThan(0)

    await conforms('acceptTerms', 201, acceptTerms, {
      method: 'POST',
      bearer: token,
      body: { version: `conf-${RUN}` },
    })
  })
})

describe('reseñas', () => {
  it('pregunta por el entregado, lo descarta y aún lo califica', async () => {
    const seed = await seedContraentregaOrder()
    try {
      // Las reseñas van sobre un pedido entregado y propio: el seed se pone a nombre de este cliente.
      await db
        .from('orders')
        .update({
          customer_user_id: userId,
          driver_id: E2E.DRIVER_ID,
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', seed.orderId)
        .throwOnError()
      const pending = await conforms('getCustomerPendingReview', 200, getCustomerPendingReview, {
        bearer: token,
      })
      expect(pending.orderId).toBe(seed.orderId)
      await conforms('dismissCustomerReview', 204, dismissCustomerReview, {
        method: 'POST',
        bearer: token,
        body: {},
        params: { id: seed.orderId },
      })
      await conforms('createCustomerReview', 200, createCustomerReview, {
        method: 'POST',
        bearer: token,
        body: { rating: 5 },
        params: { id: seed.orderId },
      })
    } finally {
      // `order_reviews`, las descartadas y `order_event_log` caen en cascada con el pedido.
      await cleanup(seed)
    }
  })
})

describe('MV5: borrar la cuenta', () => {
  it('una cuenta propia, recién creada y sin pedidos, se borra con 204', async () => {
    const email = `conformidad-borrar-${RUN}@integration.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: 'test-password-12345',
      email_confirm: true,
      user_metadata: { full_name: NOMBRE_FIXTURE },
    })
    if (error) throw new Error(`crear el cliente a borrar falló: ${error.message}`)
    const id = data.user.id
    try {
      await db.from('customer_profiles').insert({ user_id: id, full_name: NOMBRE_FIXTURE })
      const own = await signIn(email, 'test-password-12345')
      await conforms('deleteCustomerAccount', 204, deleteCustomerAccount, {
        method: 'DELETE',
        bearer: own,
      })
    } finally {
      // Queda la lápida de `public.users`: no tiene pedidos, se puede quitar.
      // 0278: una cuenta borrada deja su historia del número.
      await cleanupPhoneSecurityFixtures(db, [id])
      await db.from('users').delete().eq('id', id)
      await db.auth.admin.deleteUser(id)
    }
  })
})

describe('traslado del número y avisos de seguridad', () => {
  it('las tres rutas nuevas responden con el contrato publicado', async () => {
    const ids: string[] = []
    const number = `9${String(Date.now()).slice(-8)}`
    try {
      const sessions: string[] = []
      for (const side of ['a', 'b']) {
        const email = `phone-conformance-${side}-${crypto.randomUUID()}@integration.local`
        const { data, error } = await db.auth.admin.createUser({
          email,
          password: 'test-password-12345',
          email_confirm: true,
          user_metadata: { full_name: NOMBRE_FIXTURE },
        })
        if (error) throw new Error(error.message)
        ids.push(data.user.id)
        await db
          .from('customer_profiles')
          .insert({ user_id: data.user.id, full_name: NOMBRE_FIXTURE })
          .throwOnError()
        sessions.push(await signIn(email, 'test-password-12345'))
      }
      const [a, b] = sessions
      if (!a || !b) throw new Error('sin sesiones')
      await conforms('verifyPhoneCode', 200, verifyPhoneCode, {
        method: 'POST',
        bearer: a,
        body: { phone: number, code: DEV_OTP_CODE },
      })
      const pending = await call(verifyPhoneCode, {
        method: 'POST',
        bearer: b,
        body: { phone: number, code: DEV_OTP_CODE },
      })
      expect(pending.status).toBe(409)
      const proof = PhoneTransferSchema.parse(ProblemDetailsSchema.parse(pending.body).transfer)
      await conforms('transferCustomerPhone', 200, transferPhone, {
        method: 'POST',
        bearer: b,
        body: { challengeId: proof.challengeId },
      })
      const listed = await call(getSecurityNotices, { bearer: a })
      expect(listed.status).toBe(200)
      expectConforms('getCustomerSecurityNotices', 200, listed.body)
      const rows = CustomerSecurityNoticesSchema.parse((listed.body as { data: unknown }).data)
      const id = rows[0]?.id
      if (!id) throw new Error('sin aviso')
      await conforms('seeCustomerSecurityNotice', 204, seeSecurityNotice, {
        method: 'POST',
        bearer: a,
        body: {},
        params: { id },
      })
    } finally {
      if (ids.length) {
        const { data: rows } = await db
          .from('customer_security_notices')
          .select('id')
          .in('user_id', ids)
          .throwOnError()
        for (const n of rows ?? [])
          await db.from('domain_events').delete().eq('aggregate_id', n.id).throwOnError()
        await db.from('customer_security_notices').delete().in('user_id', ids).throwOnError()
        await db.from('phone_transfer_challenges').delete().in('user_id', ids).throwOnError()
        await db.from('phone_assignments').delete().in('user_id', ids).throwOnError()
        for (const id of ids) {
          await db.from('users').delete().eq('id', id).throwOnError()
          await db.auth.admin.deleteUser(id)
        }
      }
    }
  })
})

describe('cobertura', () => {
  it('ninguna operación documentada se queda sin comprobar contra su ruta', () => {
    const documented = OPERATIONS.filter((op) => op.documented).map((op) => op.operationId)
    expect(documented.filter((id) => !checkedOperations().has(id))).toEqual([])
  })
})
