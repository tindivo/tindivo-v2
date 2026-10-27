/**
 * 0276: el JWT real del cliente solo lee perfil, términos y apelaciones.
 * Los fixtures y las comprobaciones internas usan servicio; los intentos de
 * escritura usan siempre anon o la sesión authenticated. Solo base LOCAL,
 * bajo el candado exigido al importar local-db. Las RPC se llaman por HTTP.
 */
import { execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@tindivo/supabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as createCourierOrder } from '../../app/api/v1/customer/courier-orders/route'
import { POST as createOrder } from '../../app/api/v1/customer/orders/route'
import { POST as sendPhoneCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as verifyPhone } from '../../app/api/v1/customer/phone/verify/route'
import { GET as getProfile, PUT as putProfile } from '../../app/api/v1/customer/profile/route'
import { POST as acceptTerms } from '../../app/api/v1/customer/terms-acceptance/route'
import { DEV_OTP_CODE, OTP_DEV_SIMULATION } from '../twilio/client'
import { localClient as db } from './helpers/local-db'
import { COURIER_POINT_A, COURIER_POINT_B, patchCourierSettings } from './helpers/local-db-courier'
import { expectConforms } from './helpers/openapi-conformance'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= SERVICE_KEY

const PASSWORD = 'test-password-12345'
const NAME = 'Vecino Integración'
const OTHER_PHONE = '999111222'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = () => createClient<Database>(URL, ANON_KEY, opts)

interface Customer {
  id: string
  phone: string
  token: string
  client: ReturnType<typeof anon>
}

const customers: Customer[] = []
let businessId = ''
let itemId = ''
let courierSettings: Database['public']['Tables']['app_settings']['Row']['value'] | null = null

async function customer(profile = true, verified = true): Promise<Customer> {
  const phone = `9${randomInt(10_000_000, 100_000_000)}`
  const email = `perfil-servidor-${crypto.randomUUID()}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: NAME },
  })
  if (error) throw new Error(error.message)
  const client = anon()
  const { data: login, error: loginError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
  if (loginError || !login.session) throw new Error(loginError?.message ?? 'sin sesión')
  const c = { id: data.user.id, phone, token: login.session.access_token, client }
  customers.push(c)
  if (profile) {
    await db
      .from('customer_profiles')
      .insert({
        user_id: c.id,
        full_name: NAME,
        phone: `+51${phone}`,
        phone_verified_at: verified ? new Date().toISOString() : null,
      })
      .throwOnError()
  }
  return c
}

function call(
  handler: (req: Request) => Promise<Response>,
  c: Customer,
  method: string,
  body?: unknown,
) {
  return handler(
    new Request('http://localhost:3001/api/v1/customer/test', {
      method,
      headers: {
        authorization: `Bearer ${c.token}`,
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

function orderBody() {
  return {
    businessId,
    deliveryMethod: 'pickup',
    pickupTiming: 'now',
    paymentIntent: 'prepaid',
    customerName: NAME,
    customerPhone: OTHER_PHONE,
    items: [{ menuItemId: itemId, quantity: 1, modifiers: [] }],
  }
}

function courierBody() {
  return {
    requesterName: NAME,
    requesterPhone: OTHER_PHONE,
    origin: {
      contactName: 'Origen tercero',
      contactPhone: '988111222',
      coordinates: COURIER_POINT_A,
      referenceText: 'Frente al parque, prueba de integración',
    },
    destination: {
      contactName: 'Destino tercero',
      contactPhone: '977111222',
      coordinates: COURIER_POINT_B,
      referenceText: 'Casa de dos pisos, prueba de integración',
    },
    itemDescription: 'Un paquete de prueba',
    isFragile: false,
    readyInMin: 0,
    payer: 'destination',
    weightConfirmed: true,
    prepaidConfirmed: true,
  }
}

async function readOrderPhone(id: string) {
  const { data } = await db
    .from('orders')
    .select('customer_phone')
    .eq('id', id)
    .single()
    .throwOnError()
  return data?.customer_phone
}

beforeAll(async () => {
  const owner = await customer(false)
  const { data: business } = await db
    .from('businesses')
    .insert({
      user_id: owner.id,
      name: 'ZZ Test perfil servidor',
      is_active: true,
      is_blocked: false,
      publishes_catalog: true,
      accepts_web_pickup: true,
      accepts_web_delivery: true,
      uses_tindivo_drivers: true,
    })
    .select('id')
    .single()
    .throwOnError()
  if (!business) throw new Error('sin negocio')
  businessId = business.id
  const { data: category } = await db
    .from('menu_categories')
    .insert({ business_id: businessId, name: 'Prueba' })
    .select('id')
    .single()
    .throwOnError()
  if (!category) throw new Error('sin categoría')
  const { data: item } = await db
    .from('menu_items')
    .insert({
      business_id: businessId,
      category_id: category.id,
      name: 'Plato de prueba',
      base_price: 10,
      is_available: true,
    })
    .select('id')
    .single()
    .throwOnError()
  if (!item) throw new Error('sin plato')
  itemId = item.id
  const { data: date } = await db.rpc('current_service_date').throwOnError()
  if (!date) throw new Error('sin jornada')
  await db
    .from('business_service_days')
    .insert({
      business_id: businessId,
      service_date: date,
      status: 'open',
    })
    .throwOnError()
  const { data: settings } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
    .throwOnError()
  courierSettings = settings?.value ?? null
  await patchCourierSettings({
    enabled: true,
    ignoreSchedule: true,
    maxActivePerPhone: 1,
    unlimitedRequesterUserIds: [],
  })
})

afterAll(async () => {
  if (courierSettings !== null) {
    await db
      .from('app_settings')
      .update({ value: courierSettings })
      .eq('key', 'courier')
      .throwOnError()
  }
  if (businessId) {
    const { data: orders } = await db
      .from('orders')
      .select('id')
      .eq('business_id', businessId)
      .throwOnError()
    for (const order of orders ?? []) {
      await db.from('domain_events').delete().eq('aggregate_id', order.id).throwOnError()
    }
    await db.from('orders').delete().eq('business_id', businessId).throwOnError()
    await db.from('businesses').delete().eq('id', businessId).throwOnError()
  }
  for (const c of customers) {
    await db.from('customer_strikes').delete().eq('phone', c.phone).throwOnError()
    await db.from('courier_orders').delete().eq('customer_user_id', c.id).throwOnError()
    await db.from('reports').delete().eq('created_by', c.id).throwOnError()
    // El trigger de strikes crea reportes sin created_by cuando no hay operador.
    await db.from('reports').delete().eq('customer_phone', c.phone).throwOnError()
    await db.from('users').delete().eq('id', c.id).throwOnError()
    const { error } = await db.auth.admin.deleteUser(c.id)
    if (error) throw new Error(error.message)
  }
})

describe('0276 · escrituras del navegador denegadas', () => {
  it('authenticated no puede insertar, cambiar ni borrar su perfil; sí leerlo', async () => {
    const c = await customer()
    // Una cuenta sin fila evita confundir denegación con PK duplicada.
    const missing = await customer(false)
    const inserted = await missing.client.from('customer_profiles').insert({
      user_id: missing.id,
      full_name: NAME,
      phone: `+51${missing.phone}`,
      phone_verified_at: new Date().toISOString(),
      strikes: 0,
    })
    expect(inserted.error?.code).toBe('42501')
    expect(
      (
        await c.client
          .from('customer_profiles')
          .update({ phone: `+51${OTHER_PHONE}` })
          .eq('user_id', c.id)
      ).error?.code,
    ).toBe('42501')
    expect(
      (await c.client.from('customer_profiles').delete().eq('user_id', c.id)).error?.code,
    ).toBe('42501')
    const own = await c.client.from('customer_profiles').select('user_id,phone').eq('user_id', c.id)
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ user_id: c.id, phone: `+51${c.phone}` }])
    const another = await customer()
    const other = await c.client
      .from('customer_profiles')
      .select('user_id')
      .eq('user_id', another.id)
    expect(other.error).toBeNull()
    expect(other.data).toEqual([])
  })

  it('authenticated solo lee su aceptación; la API conserva la fecha al repetirla', async () => {
    const c = await customer()
    const first = await call(acceptTerms, c, 'POST', { version: 's1' })
    expect(first.status).toBe(201)
    const original = (await first.json()).data
    const repeated = await call(acceptTerms, c, 'POST', { version: 's1' })
    expect(repeated.status).toBe(200)
    expect((await repeated.json()).data).toEqual({ ...original, alreadyAccepted: true })
    expect(
      (await c.client.from('terms_acceptance').insert({ user_id: c.id, version: 'fake' })).error
        ?.code,
    ).toBe('42501')
    expect(
      (await c.client.from('terms_acceptance').update({ version: 'fake' }).eq('user_id', c.id))
        .error?.code,
    ).toBe('42501')
    expect((await c.client.from('terms_acceptance').delete().eq('user_id', c.id)).error?.code).toBe(
      '42501',
    )
    const read = await c.client
      .from('terms_acceptance')
      .select('version,accepted_at')
      .eq('user_id', c.id)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([{ version: 's1', accepted_at: original.acceptedAt }])
  })

  it('authenticated no puede fabricar una apelación resuelta con devolución', async () => {
    const c = await customer()
    const response = await c.client.from('reports').insert({
      type: 'rejected_proof_disputed',
      created_by: c.id,
      customer_user_id: c.id,
      order_id: crypto.randomUUID(),
      appeal_status: 'approved',
      refund_amount: 500,
      status: 'resolved',
    })
    expect(response.error?.code).toBe('42501')
  })

  it('anon no puede escribir ninguna de las tres tablas ni leer datos propios', async () => {
    const c = await customer()
    await db.from('terms_acceptance').insert({ user_id: c.id, version: 's1-anon' }).throwOnError()
    await db
      .from('reports')
      .insert({
        type: 'rejected_proof_disputed',
        created_by: c.id,
        customer_user_id: c.id,
        status: 'open',
        appeal_status: 'pending',
      })
      .throwOnError()
    const client = anon()
    for (const table of ['customer_profiles', 'terms_acceptance', 'reports'] as const) {
      const write =
        table === 'customer_profiles'
          ? await client.from(table).insert({
              user_id: c.id,
              full_name: NAME,
              phone_verified_at: new Date().toISOString(),
            })
          : table === 'terms_acceptance'
            ? await client.from(table).insert({ user_id: c.id, version: 'fake' })
            : await client.from(table).insert({
                type: 'rejected_proof_disputed',
                created_by: c.id,
                appeal_status: 'approved',
                refund_amount: 500,
              })
      expect(write.error?.code, table).toBe('42501')
      const update =
        table === 'customer_profiles'
          ? await client.from(table).update({ phone: OTHER_PHONE }).eq('user_id', c.id)
          : table === 'terms_acceptance'
            ? await client.from(table).update({ version: 'fake' }).eq('user_id', c.id)
            : await client.from(table).update({ appeal_status: 'approved' }).eq('created_by', c.id)
      expect(update.error?.code, table).toBe('42501')
      const deleted =
        table === 'customer_profiles'
          ? await client.from(table).delete().eq('user_id', c.id)
          : table === 'terms_acceptance'
            ? await client.from(table).delete().eq('user_id', c.id)
            : await client.from(table).delete().eq('created_by', c.id)
      expect(deleted.error?.code, table).toBe('42501')
      const read = await client.from(table).select('*')
      // PostgREST puede denegar el SELECT o devolver cero filas por la RLS.
      if (read.error) expect(read.error.code).toBe('42501')
      else expect(read.data).toEqual([])
    }
  })
})

describe('el teléfono operativo lo decide el perfil', () => {
  it('el pedido ignora customerPhone y guarda el verificado en nueve dígitos', async () => {
    const c = await customer()
    const response = await call(createOrder, c, 'POST', orderBody())
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    expect(await readOrderPhone(body.data.id)).toBe(c.phone)
  })

  it('los strikes del teléfono verificado bloquean aunque el cuerpo traiga otro', async () => {
    const c = await customer()
    const { data: setting } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'strikes')
      .single()
      .throwOnError()
    const config = setting?.value as { temporaryBlockThreshold?: number } | null
    const count = config?.temporaryBlockThreshold ?? 3
    await db
      .from('customer_strikes')
      .insert(
        Array.from({ length: count }, () => ({
          phone: c.phone,
          reason: 'no_show',
        })),
      )
      .throwOnError()
    // Sin bloqueo de perfil: esta prueba debe alcanzar el predicado POR TELÉFONO.
    const { data: profile } = await db
      .from('customer_profiles')
      .select('blocked_until')
      .eq('user_id', c.id)
      .single()
      .throwOnError()
    expect(profile?.blocked_until).toBeNull()
    const response = await call(createOrder, c, 'POST', orderBody())
    expect(response.status).toBe(422)
    expect((await response.json()).detail).toContain('Por razones operativas')
    const { count: orders } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_user_id', c.id)
      .throwOnError()
    expect(orders).toBe(0)
  })

  it('Entregas deriva el solicitante y conserva los teléfonos de los terceros', async () => {
    const c = await customer()
    const response = await call(createCourierOrder, c, 'POST', courierBody())
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(201)
    const { data } = await db
      .from('courier_orders')
      .select('requester_phone,origin_phone,destination_phone')
      .eq('id', body.data.id)
      .single()
      .throwOnError()
    expect(data).toEqual({
      requester_phone: c.phone,
      origin_phone: '988111222',
      destination_phone: '977111222',
    })
    // Cambiar el cuerpo tampoco elude el candado ni el conteo de activas.
    const second = await call(createCourierOrder, c, 'POST', {
      ...courierBody(),
      requesterPhone: '966111222',
    })
    expect(second.status).toBe(409)
    expect((await second.json()).detail).toBe('Ya tienes una entrega en curso.')
  })

  it('Entregas sin perfil verificado devuelve forbidden (403)', async () => {
    for (const c of [await customer(true, false), await customer(false)]) {
      const response = await call(createCourierOrder, c, 'POST', courierBody())
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        code: 'forbidden',
        detail: 'Verifica tu número de WhatsApp antes de hacer un pedido.',
      })
    }
  })

  it('la cuenta ilimitada usa el cuerpo aun sin perfil', async () => {
    const c = await customer(false)
    await patchCourierSettings({ unlimitedRequesterUserIds: [c.id] })
    try {
      for (let i = 0; i < 2; i++) {
        const response = await call(createCourierOrder, c, 'POST', courierBody())
        const body = await response.json()
        expect(response.status, JSON.stringify(body)).toBe(201)
        const { data } = await db
          .from('courier_orders')
          .select('requester_phone')
          .eq('id', body.data.id)
          .single()
          .throwOnError()
        expect(data?.requester_phone).toBe(OTHER_PHONE)
      }
    } finally {
      await patchCourierSettings({ unlimitedRequesterUserIds: [] })
    }
  })
})

describe('perfil y OTP por la API', () => {
  it('PUT crea, actualiza e idempotentemente devuelve la misma forma que GET', async () => {
    const c = await customer(false)
    const created = await call(putProfile, c, 'PUT', {
      fullName: '  Rosa Pérez  ',
      phone: OTHER_PHONE,
      phone_verified_at: new Date().toISOString(),
      strikes: 0,
    })
    expect(created.status).toBe(200)
    const initial = await created.json()
    expectConforms('updateCustomerProfile', 200, initial)
    expect(initial.data).toMatchObject({
      fullName: 'Rosa Pérez',
      phone: null,
      phoneVerified: false,
    })
    await db
      .from('customer_profiles')
      .update({
        phone: `+51${c.phone}`,
        phone_verified_at: new Date().toISOString(),
        strikes: 2,
        contraentrega_blocked: true,
      })
      .eq('user_id', c.id)
      .throwOnError()
    const changed = await call(putProfile, c, 'PUT', { fullName: 'Rosa Quispe' })
    expect(changed.status).toBe(200)
    const expected = await changed.json()
    expect(expected.data).toMatchObject({
      fullName: 'Rosa Quispe',
      phone: `+51${c.phone}`,
      phoneVerified: true,
      contraentregaBlocked: true,
    })
    const repeated = await call(putProfile, c, 'PUT', { fullName: 'Rosa Quispe' })
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual(expected)
    const get = await call(getProfile, c, 'GET')
    expect(get.status).toBe(200)
    expect(await get.json()).toEqual(expected)
    const { data } = await db
      .from('customer_profiles')
      .select('strikes')
      .eq('user_id', c.id)
      .single()
      .throwOnError()
    expect(data?.strikes).toBe(2)
  })

  it('verify sin perfil devuelve conflict; no inventa un éxito ni crea la fila', async () => {
    expect(OTP_DEV_SIMULATION).toBe(true)
    const c = await customer(false)
    // El simulacro no debe anunciar verified:true cuando tampoco pudo sellar.
    const sent = await call(sendPhoneCode, c, 'POST', { phone: c.phone })
    expect(sent.status).toBe(409)
    expect(await sent.json()).toMatchObject({
      code: 'conflict',
      detail: 'Completa tu nombre antes de verificar tu número.',
    })
    const response = await call(verifyPhone, c, 'POST', { phone: c.phone, code: DEV_OTP_CODE })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'conflict',
      detail: 'Completa tu nombre antes de verificar tu número.',
    })
    const { data } = await db
      .from('customer_profiles')
      .select('user_id')
      .eq('user_id', c.id)
      .throwOnError()
    expect(data).toEqual([])
  })

  it('PUT respeta el rechazo existente del trigger ante una cuenta borrada', async () => {
    const c = await customer(false)
    await db
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', c.id)
      .throwOnError()
    const response = await call(putProfile, c, 'PUT', { fullName: NAME })
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'internal_error' })
    const { data } = await db
      .from('customer_profiles')
      .select('user_id')
      .eq('user_id', c.id)
      .throwOnError()
    expect(data).toEqual([])
  })
})

describe('firmas únicas y resolución real de PostgREST', () => {
  it('cada RPC tiene exactamente una fila en pg_proc', () => {
    const output = execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'supabase_db_zpnipajgwfthxhdtzhly',
        'psql',
        '-U',
        'postgres',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      {
        input: `select p.proname || '|' || count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
      and p.proname in ('create_customer_order', 'create_courier_order')
      group by p.proname order by p.proname;`,
        encoding: 'utf8',
      },
    )
    expect(output.trim().split(/\r?\n/)).toEqual([
      'create_courier_order|1',
      'create_customer_order|1',
    ])
  })

  it('ambas RPC funcionan por HTTP y descartan el teléfono manipulado', async () => {
    const c = await customer()
    const cases = [
      [
        'create_customer_order',
        {
          p_business_id: businessId,
          p_customer_user_id: c.id,
          p_delivery_method: 'pickup',
          p_payment_intent: 'prepaid',
          p_customer_name: NAME,
          p_customer_phone: OTHER_PHONE,
          p_items: [{ menu_item_id: itemId, quantity: 1, modifiers: [] }],
          p_delivery_address: '',
          p_delivery_reference: '',
          p_pickup_timing: 'now',
        },
      ],
      [
        'create_courier_order',
        {
          p_customer_user_id: c.id,
          p_requester_name: NAME,
          p_requester_phone: OTHER_PHONE,
          p_directory_business_id: null,
          p_origin_name: 'Origen tercero',
          p_origin_phone: null,
          p_origin_lat: COURIER_POINT_A.lat,
          p_origin_lng: COURIER_POINT_A.lng,
          p_origin_reference_text: 'Frente al parque',
          p_destination_name: NAME,
          p_destination_phone: OTHER_PHONE,
          p_destination_lat: COURIER_POINT_B.lat,
          p_destination_lng: COURIER_POINT_B.lng,
          p_destination_reference_text: 'Casa de dos pisos',
          p_item_description: 'Paquete de prueba',
          p_is_fragile: false,
          p_ready_in_min: 0,
          p_payer: 'destination',
          p_weight_confirmed: true,
          p_prepaid_confirmed: true,
        },
      ],
    ] as const
    for (const [name, args] of cases) {
      const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(args),
      })
      const body = await response.json()
      expect(response.status, JSON.stringify(body)).toBe(200)
      expect(body.id).toEqual(expect.any(String))
      if (name === 'create_customer_order') expect(await readOrderPhone(body.id)).toBe(c.phone)
      else {
        const { data } = await db
          .from('courier_orders')
          .select('requester_phone')
          .eq('id', body.id)
          .single()
          .throwOnError()
        expect(data?.requester_phone).toBe(c.phone)
      }
    }
  })
})
