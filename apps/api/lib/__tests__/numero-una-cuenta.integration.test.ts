/**
 * 0277: sesiones reales y RPC por HTTP contra Supabase LOCAL, bajo candado.
 * Las dos carreras lanzan peticiones simultáneas, sin esperar una antes de otra.
 * Este archivo lo ejecuta el orquestador después de aplicar la migración.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { CustomerSecurityNoticesSchema, PhoneTransferSchema } from '@tindivo/contracts'
import type { Database, TablesInsert } from '@tindivo/supabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as transfer } from '../../app/api/v1/customer/phone/transfer/route'
import { POST as verify } from '../../app/api/v1/customer/phone/verify/route'
import { POST as seeNotice } from '../../app/api/v1/customer/security-notices/[id]/seen/route'
import { GET as notices } from '../../app/api/v1/customer/security-notices/route'
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

const NAME = 'Vecino Número Único'
const MIGRATION_0277 = new globalThis.URL(
  '../../../../supabase/migrations/0277_un_numero_verificado_una_sola_cuenta.sql',
  import.meta.url,
)
const PASSWORD = 'test-password-12345'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = () => createClient<Database>(URL, ANON_KEY, opts)
type Customer = { id: string; phone: string; token: string; client: ReturnType<typeof anon> }
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const customers: Customer[] = []
const phones = new Set<string>()
let businessId = ''
let ownerId = ''
let itemId = ''
let courierSettings: Database['public']['Tables']['app_settings']['Row']['value'] | null = null

function phone() {
  const value = `9${randomInt(10_000_000, 100_000_000)}`
  phones.add(value)
  return value
}

const PSQL = [
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
]

/** La barrera no se abre hasta MEDIR dos backends distintos esperando un bloqueo. */
async function withDatabaseGate<T>(
  lockSql: string,
  names: string[],
  run: () => Promise<T>,
): Promise<T> {
  const gate = spawn('docker', PSQL, { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = new Promise<number | null>((resolve, reject) => {
    gate.once('error', reject)
    gate.once('exit', resolve)
  })
  let output = ''
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La barrera de concurrencia no abrió')), 10_000)
    gate.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('PHONE_GATE_READY')) {
        clearTimeout(timer)
        resolve()
      }
    })
    gate.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    gate.once('exit', () => {
      clearTimeout(timer)
      reject(new Error('psql terminó antes de abrir la barrera'))
    })
  })
  gate.stdin.write(`begin; ${lockSql}; select 'PHONE_GATE_READY';\n`)
  let pending: Promise<T> | undefined
  try {
    await ready
    pending = run()
    let waiting = 0
    const deadline = Date.now() + 10_000
    while (waiting < 2 && Date.now() < deadline) {
      const raw = execFileSync('docker', PSQL, {
        input: `select count(distinct pid) from pg_stat_activity where state = 'active' and wait_event_type = 'Lock' and (${names.map((n) => `query like '%${n}%'`).join(' or ')});`,
        encoding: 'utf8',
      })
      waiting = Number(raw.trim())
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 30))
    }
    expect(
      waiting,
      'dos conexiones HTTP deben estar esperando al mismo tiempo',
    ).toBeGreaterThanOrEqual(2)
  } finally {
    gate.stdin.end('commit;\n')
    expect(await exited).toBe(0)
    // Espera también al liberar si falla la medición; ningún trabajo queda suelto.
    if (pending) await pending
  }
  if (!pending) throw new Error('La carrera no empezó')
  return pending
}

async function customer(): Promise<Customer> {
  const email = `numero-unico-${crypto.randomUUID()}@integration.local`
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
  const c = { id: data.user.id, phone: phone(), token: login.session.access_token, client }
  customers.push(c)
  await db.from('customer_profiles').insert({ user_id: c.id, full_name: NAME }).throwOnError()
  return c
}

function call(
  handler: Handler,
  c: Customer,
  body?: unknown,
  params: Record<string, string> = {},
  method = 'POST',
) {
  return handler(
    new Request('http://localhost:3001/api/v1/customer/test', {
      method,
      headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve(params) },
  )
}

async function claim(c: Customer, number = c.phone, challengeId?: string) {
  const { data } = await db
    .rpc('claim_customer_phone', {
      p_user_id: c.id,
      p_phone: `+51${number}`,
      ...(challengeId ? { p_challenge_id: challengeId } : {}),
    })
    .throwOnError()
  if (data === null || Array.isArray(data) || typeof data !== 'object')
    throw new Error('RPC sin objeto')
  return data
}

async function challenge(c: Customer, number: string, handler: Handler = verify) {
  const response = await call(handler, c, { phone: number, code: DEV_OTP_CODE })
  expect(response.status).toBe(409)
  const body = await response.json()
  expect(body).toMatchObject({
    code: 'conflict',
    detail: 'Este número ya está asociado a otra cuenta.',
  })
  return PhoneTransferSchema.parse(body.transfer)
}

async function assignments(number: string) {
  const { data } = await db
    .from('phone_assignments')
    .select('*')
    .eq('phone', `+51${number}`)
    .order('started_at')
    .throwOnError()
  return data ?? []
}

async function profile(c: Customer) {
  const { data } = await db
    .from('customer_profiles')
    .select('phone,phone_verified_at,blocked_until,contraentrega_blocked')
    .eq('user_id', c.id)
    .single()
    .throwOnError()
  return data
}

async function order(c: Customer, patch: Partial<TablesInsert<'orders'>> = {}) {
  const { data } = await db
    .from('orders')
    .insert({
      business_id: businessId,
      customer_user_id: c.id,
      customer_name: NAME,
      customer_phone: c.phone,
      short_id: crypto.randomUUID().slice(0, 8).replace(/[01]/g, 'X').toUpperCase(),
      order_amount: 10,
      delivery_fee: 0,
      delivery_method: 'pickup',
      payment_intent: 'prepaid',
      status: 'confirmed',
      ...patch,
    })
    .select('id')
    .single()
    .throwOnError()
  if (!data) throw new Error('sin pedido')
  return data.id
}

async function courier(c: Customer) {
  const { data } = await db
    .from('courier_orders')
    .insert({
      customer_user_id: c.id,
      requester_name: NAME,
      requester_phone: c.phone,
      short_id: crypto.randomUUID().slice(0, 8).replace(/[01]/g, 'X').toUpperCase(),
      origin_name: 'Origen',
      origin_lat: COURIER_POINT_A.lat,
      origin_lng: COURIER_POINT_A.lng,
      origin_reference_text: 'Frente al parque',
      destination_name: NAME,
      destination_lat: COURIER_POINT_B.lat,
      destination_lng: COURIER_POINT_B.lng,
      destination_reference_text: 'Casa de prueba',
      item_description: 'Paquete',
      fee_amount: 5,
      ready_at: new Date().toISOString(),
      weight_confirmed: true,
      prepaid_confirmed: true,
    })
    .select('id')
    .single()
    .throwOnError()
  if (!data) throw new Error('sin Entrega')
  return data.id
}

/** create_courier_order por HTTP real (PostgREST), como la llama la API. */
function courierRpc(c: Customer) {
  return fetch(`${URL}/rest/v1/rpc/create_courier_order`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_directory_business_id: null,
      p_customer_user_id: c.id,
      p_requester_name: NAME,
      p_requester_phone: c.phone,
      p_origin_name: 'Origen',
      p_origin_phone: c.phone,
      p_origin_lat: COURIER_POINT_A.lat,
      p_origin_lng: COURIER_POINT_A.lng,
      p_origin_reference_text: 'Frente al parque',
      p_destination_name: NAME,
      p_destination_phone: c.phone,
      p_destination_lat: COURIER_POINT_B.lat,
      p_destination_lng: COURIER_POINT_B.lng,
      p_destination_reference_text: 'Casa de prueba',
      p_item_description: 'Paquete',
      p_is_fragile: false,
      p_ready_in_min: 0,
      p_payer: 'destination',
      p_weight_confirmed: true,
      p_prepaid_confirmed: true,
    }),
  })
}

async function restrict(c: Customer) {
  const until = new Date(Date.now() + 48 * 3600_000).toISOString()
  await db
    .from('customer_profiles')
    .update({ blocked_until: until, contraentrega_blocked: true })
    .eq('user_id', c.id)
    .throwOnError()
  return until
}

/** Bloqueo y prepago que el número arrastra para `c`, también ante la cajera. */
async function expectRestricted(c: Customer, number: string, until: string, sourceId: string) {
  const { data: rows } = await db
    .from('phone_restrictions')
    .select('kind,until,source_user_id,lifted_at')
    .eq('phone', number)
    .throwOnError()
  expect(rows?.filter((r) => r.lifted_at === null)).toHaveLength(2)
  expect(rows?.every((r) => r.source_user_id === sourceId)).toBe(true)
  expect(new Date(rows?.find((r) => r.kind === 'blocked')?.until ?? '').toISOString()).toBe(until)
  expect(
    (await db.rpc('customer_is_blocked', { p_user_id: c.id, p_phone: number }).throwOnError()).data,
  ).toBe(true)
  expect(
    (
      await db
        .rpc('customer_requires_prepayment', {
          p_user_id: c.id,
          p_phone: number,
          p_reference: '',
        })
        .throwOnError()
    ).data,
  ).toBe(true)
  const manual = await db.rpc('create_business_manual_order', {
    p_business_user_id: ownerId,
    p_customer_phone: number,
    p_delivery_method: 'pickup',
    p_payment_intent: 'pending_cash',
    p_total_amount: 10,
  })
  expect(manual.error?.message).toMatch(/bloque|operativ/i)
}

beforeAll(async () => {
  expect(OTP_DEV_SIMULATION).toBe(true)
  const owner = await customer()
  ownerId = owner.id
  const { data: business } = await db
    .from('businesses')
    .insert({
      user_id: owner.id,
      name: 'ZZ Test número único',
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
      name: 'Plato',
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
    .insert({ business_id: businessId, service_date: date, status: 'open' })
    .throwOnError()
  const { data: setting } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
    .throwOnError()
  courierSettings = setting?.value ?? null
  await patchCourierSettings({
    enabled: true,
    ignoreSchedule: true,
    maxActivePerPhone: 1,
    unlimitedRequesterUserIds: [],
  })
})

afterAll(async () => {
  if (courierSettings !== null)
    await db
      .from('app_settings')
      .update({ value: courierSettings })
      .eq('key', 'courier')
      .throwOnError()
  const ids = customers.map((c) => c.id)
  if (!ids.length) return
  const { data: noticeIds } = await db
    .from('customer_security_notices')
    .select('id')
    .in('user_id', ids)
    .throwOnError()
  for (const n of noticeIds ?? [])
    await db.from('domain_events').delete().eq('aggregate_id', n.id).throwOnError()
  const { data: orderIds } = await db
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .throwOnError()
  for (const o of orderIds ?? [])
    await db.from('domain_events').delete().eq('aggregate_id', o.id).throwOnError()
  await db.from('orders').delete().eq('business_id', businessId).throwOnError()
  await db.from('courier_orders').delete().in('customer_user_id', ids).throwOnError()
  await db.from('phone_transfer_challenges').delete().in('user_id', ids).throwOnError()
  await db.from('customer_security_notices').delete().in('user_id', ids).throwOnError()
  await db
    .from('phone_restrictions')
    .delete()
    .in('phone', [...phones])
    .throwOnError()
  await db.from('phone_assignments').delete().in('user_id', ids).throwOnError()
  await db
    .from('address_directory')
    .delete()
    .in('phone', [...phones])
    .throwOnError()
  if (businessId) await db.from('businesses').delete().eq('id', businessId).throwOnError()
  for (const c of customers) {
    await db.from('users').delete().eq('id', c.id).throwOnError()
    const { error } = await db.auth.admin.deleteUser(c.id)
    // delete_customer_account ya borró el usuario de auth de quien se dio de baja.
    if (error && error.status !== 404) throw new Error(error.message)
  }
})

describe('0277 · un número, una cuenta', () => {
  it('verifica por simulacro y reverifica por OTP sin abrir otra asignación', async () => {
    const c = await customer()
    const sent = await call(sendCode, c, { phone: c.phone })
    expect(sent.status).toBe(200)
    expect((await sent.json()).data).toEqual({ sent: true, verified: true, channel: 'dev' })
    const first = await assignments(c.phone)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ user_id: c.id, start_reason: 'verification', ended_at: null })
    const repeated = await call(verify, c, { phone: c.phone, code: DEV_OTP_CODE })
    expect(repeated.status).toBe(200)
    expect((await repeated.json()).data).toEqual({ verified: true, phone: `+51${c.phone}` })
    expect(await assignments(c.phone)).toEqual(first)
    expect(await profile(c)).toMatchObject({
      phone: `+51${c.phone}`,
      phone_verified_at: expect.any(String),
    })
  })

  it('traslada sin datos de A; confirma idempotente y encola un solo aviso/evento', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone)
    const response = await call(transfer, b, { challengeId: proof.challengeId })
    expect(response.status).toBe(200)
    const result = await response.json()
    expectConforms('transferCustomerPhone', 200, result)
    expect(result.data).toEqual({ verified: true, phone: `+51${a.phone}`, transferred: true })
    expect(await profile(a)).toMatchObject({ phone: `+51${a.phone}`, phone_verified_at: null })
    expect(await profile(b)).toMatchObject({
      phone: `+51${a.phone}`,
      phone_verified_at: expect.any(String),
    })
    const history = await assignments(a.phone)
    expect(history).toHaveLength(2)
    expect(history.find((x) => x.user_id === a.id)).toMatchObject({
      end_reason: 'self_transfer',
      ended_at: expect.any(String),
    })
    expect(history.find((x) => x.user_id === b.id)).toMatchObject({
      start_reason: 'self_transfer',
      ended_at: null,
    })
    const repeated = await call(transfer, b, { challengeId: proof.challengeId })
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual(result)
    expect(await assignments(a.phone)).toEqual(history)
    const { data: rows } = await db
      .from('customer_security_notices')
      .select('*')
      .eq('user_id', a.id)
      .throwOnError()
    expect(rows).toHaveLength(1)
    const notice = rows?.[0]
    expect(notice).toMatchObject({
      kind: 'phone_moved',
      phone_last3: a.phone.slice(-3),
      seen_at: null,
    })
    const { data: events } = await db
      .from('domain_events')
      .select('payload,event_type')
      .eq('aggregate_id', notice?.id ?? '')
      .throwOnError()
    expect(events).toEqual([{ event_type: 'CustomerPhoneMoved', payload: { userId: a.id } }])
  })

  it('si A borró su cuenta, B verifica el número sin traslado y empieza sin confianza', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const deleted = await db.rpc('delete_customer_account', { p_user_id: a.id }).throwOnError()
    expect(deleted.data).toMatchObject({ status: 'deleted' })
    const response = await call(verify, b, { phone: a.phone, code: DEV_OTP_CODE })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ verified: true, phone: `+51${a.phone}` })
    const history = await assignments(a.phone)
    expect(history).toHaveLength(2)
    expect(history.find((x) => x.user_id === a.id)).toMatchObject({
      end_reason: 'account_deleted',
      ended_at: expect.any(String),
    })
    expect(history.find((x) => x.user_id === b.id)).toMatchObject({
      start_reason: 'verification',
      ended_at: null,
    })
    const { data: notices } = await db
      .from('customer_security_notices')
      .select('id')
      .eq('user_id', a.id)
      .throwOnError()
    expect(notices).toEqual([])
    expect(
      (await db.rpc('customer_contraentrega_decision', { p_customer_user_id: b.id }).throwOnError())
        .data,
    ).toBe('no_history')
  })

  it('un perfil sellado fuera de la RPC (seeds) recibe su asignación al volver a verificar', async () => {
    const c = await customer()
    await db
      .from('customer_profiles')
      .update({ phone: `+51${c.phone}`, phone_verified_at: new Date().toISOString() })
      .eq('user_id', c.id)
      .throwOnError()
    expect(await assignments(c.phone)).toEqual([])
    expect(await claim(c)).toEqual({ status: 'verified' })
    const history = await assignments(c.phone)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      user_id: c.id,
      start_reason: 'verification',
      ended_at: null,
    })
    expect(await claim(c)).toEqual({ status: 'verified' })
    expect(await assignments(c.phone)).toEqual(history)
  })

  it('si otra cuenta pide un número sellado fuera de la RPC, se le ofrece el traslado', async () => {
    const a = await customer()
    const b = await customer()
    await db
      .from('customer_profiles')
      .update({ phone: `+51${a.phone}`, phone_verified_at: new Date().toISOString() })
      .eq('user_id', a.id)
      .throwOnError()
    const proof = await challenge(b, a.phone)
    expect(await assignments(a.phone)).toMatchObject([
      { user_id: a.id, start_reason: 'verification', ended_at: null },
    ])
    expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
    expect(await profile(a)).toMatchObject({ phone_verified_at: null })
  })

  it('rechaza desafíos ajenos, vencidos, de otro número y de una asignación ya cambiada', async () => {
    const a = await customer()
    const b = await customer()
    const c = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone, sendCode)
    const foreign = await call(transfer, c, { challengeId: proof.challengeId })
    expect(foreign.status).toBe(409)
    expect((await foreign.json()).detail).toBe('El código ya no sirve. Pide uno nuevo.')
    expect(await claim(b, b.phone, proof.challengeId)).toEqual({ status: 'challenge_invalid' })
    const expired = await challenge(b, a.phone)
    await db
      .from('phone_transfer_challenges')
      .update({
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', expired.challengeId)
      .throwOnError()
    expect((await call(transfer, b, { challengeId: expired.challengeId })).status).toBe(409)
    const toC = await challenge(c, a.phone)
    expect((await call(transfer, c, { challengeId: toC.challengeId })).status).toBe(200)
    const backToA = await challenge(a, a.phone)
    expect((await call(transfer, a, { challengeId: backToA.challengeId })).status).toBe(200)
    expect(await claim(b, a.phone, proof.challengeId)).toEqual({ status: 'challenge_invalid' })
    // Ni siquiera volver al mismo dueño revive un desafío consumido anterior.
    const toCAgain = await challenge(c, a.phone)
    expect((await call(transfer, c, { challengeId: toCAgain.challengeId })).status).toBe(200)
    expect(await claim(c, a.phone, toC.challengeId)).toEqual({ status: 'challenge_invalid' })
    expect((await call(transfer, c, { challengeId: crypto.randomUUID() })).status).toBe(409)
  })

  for (const guard of ['order_a', 'courier_a', 'order_b', 'courier_b'] as const) {
    it(`espera actividad (${guard}) sin consumir el desafío ni cambiar las cuentas`, async () => {
      const a = await customer()
      const b = await customer()
      await claim(a)
      await claim(b)
      const proof = await challenge(b, a.phone)
      const subject = guard.endsWith('_a') ? a : b
      const id = guard.startsWith('order') ? await order(subject) : await courier(subject)
      const beforeA = await profile(a)
      const beforeB = await profile(b)
      const history = await assignments(a.phone)
      const response = await call(transfer, b, { challengeId: proof.challengeId })
      expect(response.status).toBe(409)
      expect((await response.json()).detail).toBe(
        'Ese número tiene un pedido en curso. Intenta cuando termine.',
      )
      expect(await profile(a)).toEqual(beforeA)
      expect(await profile(b)).toEqual(beforeB)
      expect(await assignments(a.phone)).toEqual(history)
      const { data } = await db
        .from('phone_transfer_challenges')
        .select('consumed_at')
        .eq('id', proof.challengeId)
        .single()
        .throwOnError()
      expect(data?.consumed_at).toBeNull()
      if (guard.startsWith('order'))
        await db.from('orders').update({ status: 'cancelled' }).eq('id', id).throwOnError()
      else
        await db
          .from('courier_orders')
          .update({ status: 'cancelled', cancel_reason: 'customer_cancelled' })
          .eq('id', id)
          .throwOnError()
      expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
      expect((await assignments(b.phone))[0]).toMatchObject({
        end_reason: 'replaced',
        ended_at: expect.any(String),
      })
    })
  }

  it('también espera B al verificar un número libre si sustituye uno con actividad', async () => {
    const b = await customer()
    await claim(b)
    await order(b)
    const replacement = phone()
    const response = await call(verify, b, { phone: replacement, code: DEV_OTP_CODE })
    expect(response.status).toBe(409)
    expect((await response.json()).detail).toBe(
      'Ese número tiene un pedido en curso. Intenta cuando termine.',
    )
    expect(await assignments(replacement)).toEqual([])
    expect(await profile(b)).toMatchObject({ phone: `+51${b.phone}` })
  })

  it('conserva bloqueo y prepago sobre el número, sin reiniciar el plazo; la cajera respeta el bloqueo', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const until = new Date(Date.now() + 48 * 3600_000).toISOString()
    await db
      .from('customer_profiles')
      .update({ blocked_until: until, contraentrega_blocked: true })
      .eq('user_id', a.id)
      .throwOnError()
    const proof = await challenge(b, a.phone)
    expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
    const { data: restrictions } = await db
      .from('phone_restrictions')
      .select('kind,until,source_user_id')
      .eq('phone', a.phone)
      .throwOnError()
    expect(restrictions).toHaveLength(2)
    expect(
      new Date(restrictions?.find((r) => r.kind === 'blocked')?.until ?? '').toISOString(),
    ).toBe(until)
    expect(restrictions?.every((r) => r.source_user_id === a.id)).toBe(true)
    expect(
      (await db.rpc('customer_is_blocked', { p_user_id: b.id, p_phone: a.phone }).throwOnError())
        .data,
    ).toBe(true)
    expect(
      (
        await db
          .rpc('customer_requires_prepayment', {
            p_user_id: b.id,
            p_phone: `+51${a.phone}`,
            p_reference: '',
          })
          .throwOnError()
      ).data,
    ).toBe(true)
    expect(
      (await db.rpc('customer_contraentrega_decision', { p_customer_user_id: b.id }).throwOnError())
        .data,
    ).toBe('risk_blocked')
    const manual = await db.rpc('create_business_manual_order', {
      p_business_user_id: ownerId,
      p_customer_phone: a.phone,
      p_delivery_method: 'pickup',
      p_payment_intent: 'pending_cash',
      p_total_amount: 10,
    })
    expect(manual.error?.message).toMatch(/bloque|operativ/i)
    await db
      .from('phone_restrictions')
      .update({ lifted_at: new Date().toISOString() })
      .eq('phone', a.phone)
      .eq('kind', 'blocked')
      .throwOnError()
    expect(
      (await db.rpc('customer_is_blocked', { p_user_id: b.id, p_phone: a.phone }).throwOnError())
        .data,
    ).toBe(false)
    expect(
      (
        await db
          .rpc('customer_requires_prepayment', {
            p_user_id: b.id,
            p_phone: a.phone,
            p_reference: '',
          })
          .throwOnError()
      ).data,
    ).toBe(true)
  })

  it('tras el traslado solo confía en entregas propias con ese número dentro de la asignación actual', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    await order(a, { status: 'delivered' })
    await order(b, { status: 'delivered', customer_phone: b.phone })
    // Una entrega previa de B con ese mismo número tampoco cuenta.
    await order(b, {
      status: 'delivered',
      customer_phone: a.phone,
      created_at: '2020-01-01T12:00:00Z',
    })
    await db
      .from('address_directory')
      .insert({
        phone: a.phone,
        customer_name: NAME,
        source: 'admin_curated',
        reference: 'Casa de prueba',
        lat: COURIER_POINT_A.lat,
        lng: COURIER_POINT_A.lng,
      })
      .throwOnError()
    const proof = await challenge(b, a.phone)
    expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
    expect(
      (await db.rpc('customer_contraentrega_decision', { p_customer_user_id: b.id }).throwOnError())
        .data,
    ).toBe('no_history')
    await order(b, { status: 'delivered', customer_phone: a.phone })
    expect(
      (await db.rpc('customer_contraentrega_decision', { p_customer_user_id: b.id }).throwOnError())
        .data,
    ).toBe('trusted')
  })

  for (const rule of ['account', 'phone', 'directory'] as const) {
    it(`un número nunca trasladado conserva la confianza por ${rule}`, async () => {
      const c = await customer()
      await claim(c)
      if (rule === 'account') await order(c, { status: 'delivered', customer_phone: phone() })
      if (rule === 'phone') await order(c, { status: 'delivered', customer_user_id: null })
      if (rule === 'directory')
        await db
          .from('address_directory')
          .insert({
            phone: c.phone,
            customer_name: NAME,
            source: 'admin_curated',
            reference: 'Casa de prueba',
            lat: COURIER_POINT_A.lat,
            lng: COURIER_POINT_A.lng,
          })
          .throwOnError()
      expect(
        (
          await db
            .rpc('customer_contraentrega_decision', { p_customer_user_id: c.id })
            .throwOnError()
        ).data,
      ).toBe('trusted')
    })
  }

  it('dos verificaciones simultáneas del número libre: una gana y la otra ofrece traslado', async () => {
    const a = await customer()
    const b = await customer()
    const number = phone()
    const [one, two] = await withDatabaseGate(
      `select pg_advisory_xact_lock(hashtext('customer_phone:+51${number}'))`,
      ['claim_customer_phone'],
      () =>
        Promise.all([
          call(verify, a, { phone: number, code: DEV_OTP_CODE }),
          call(verify, b, { phone: number, code: DEV_OTP_CODE }),
        ]),
    )
    expect([one.status, two.status].sort()).toEqual([200, 409])
    PhoneTransferSchema.parse((await (one.status === 409 ? one : two).json()).transfer)
    expect((await assignments(number)).filter((x) => x.ended_at === null)).toHaveLength(1)
  })

  it('traslado y creación por dos solicitudes HTTP simultáneas conservan la guarda de verificación', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone)
    const [created, moved] = await withDatabaseGate(
      `select user_id from public.customer_profiles where user_id = '${a.id}' for update`,
      ['create_customer_order', 'claim_customer_phone'],
      () =>
        Promise.all([
          db.rpc('create_customer_order', {
            p_business_id: businessId,
            p_customer_user_id: a.id,
            p_delivery_method: 'pickup',
            p_payment_intent: 'prepaid',
            p_customer_name: NAME,
            p_customer_phone: a.phone,
            p_items: [{ menu_item_id: itemId, quantity: 1, modifiers: [] }],
            p_delivery_address: '',
            p_delivery_reference: '',
            p_pickup_timing: 'now',
          }),
          call(transfer, b, { challengeId: proof.challengeId }),
        ]),
    )
    if (created.error) {
      expect(created.error.message).toMatch(/Verifica tu número/)
      expect(moved.status).toBe(200)
      expect((await profile(a))?.phone_verified_at).toBeNull()
    } else {
      expect(created.data).toBeTruthy()
      expect(moved.status).toBe(409)
      expect((await moved.json()).detail).toBe(
        'Ese número tiene un pedido en curso. Intenta cuando termine.',
      )
      expect((await profile(a))?.phone_verified_at).not.toBeNull()
    }
  })

  it('CAX-001 · A restringida cambia su número N por M: N se lleva el riesgo y B lo recibe', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const until = await restrict(a)
    const m = phone()
    expect((await call(verify, a, { phone: m, code: DEV_OTP_CODE })).status).toBe(200)
    expect(await profile(a)).toMatchObject({ phone: `+51${m}` })
    expect((await assignments(a.phone)).find((x) => x.user_id === a.id)?.end_reason).toBe(
      'replaced',
    )
    // N quedó libre: B lo verifica sin traslado, pero con el riesgo de A.
    expect((await call(verify, b, { phone: a.phone, code: DEV_OTP_CODE })).status).toBe(200)
    await expectRestricted(b, a.phone, until, a.id)
    // A conserva su propio riesgo en la cuenta, también con M.
    expect(
      (await db.rpc('customer_is_blocked', { p_user_id: a.id, p_phone: m }).throwOnError()).data,
    ).toBe(true)
  })

  it('CAX-001 · B restringida se lleva el número de A: su número anterior conserva el riesgo de B', async () => {
    const a = await customer()
    const b = await customer()
    const c = await customer()
    await claim(a)
    await claim(b)
    const until = await restrict(b)
    const proof = await challenge(b, a.phone)
    expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
    expect((await assignments(b.phone)).find((x) => x.user_id === b.id)?.end_reason).toBe(
      'replaced',
    )
    expect((await call(verify, c, { phone: b.phone, code: DEV_OTP_CODE })).status).toBe(200)
    await expectRestricted(c, b.phone, until, b.id)
  })

  it('CAX-002 · dos traslados cruzados simultáneos: uno gana, el otro queda inválido, sin abrazo mortal', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    await claim(b)
    const proofA = await challenge(a, b.phone)
    const proofB = await challenge(b, a.phone)
    const [ra, rb] = await withDatabaseGate(
      `select user_id from public.customer_profiles where user_id in ('${a.id}', '${b.id}') for update`,
      ['claim_customer_phone'],
      () =>
        Promise.all([
          call(transfer, a, { challengeId: proofA.challengeId }),
          call(transfer, b, { challengeId: proofB.challengeId }),
        ]),
    )
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    const loser = ra.status === 409 ? ra : rb
    expect((await loser.json()).detail).toBe('El código ya no sirve. Pide uno nuevo.')
    const winner = ra.status === 200 ? a : b
    const other = winner === a ? b : a
    expect(await profile(winner)).toMatchObject({
      phone: `+51${other.phone}`,
      phone_verified_at: expect.any(String),
    })
    expect(await profile(other)).toMatchObject({ phone_verified_at: null })
    const { data: open } = await db
      .from('phone_assignments')
      .select('user_id,phone')
      .in('user_id', [a.id, b.id])
      .is('ended_at', null)
      .throwOnError()
    expect(open).toEqual([{ user_id: winner.id, phone: `+51${other.phone}` }])
  })

  it('CAX-002 · traslado y creación de una Entrega simultáneos conservan la guarda', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone)
    const [created, moved] = await withDatabaseGate(
      `select user_id from public.customer_profiles where user_id = '${a.id}' for update`,
      // pg_stat_activity trunca la consulta (1024 bytes) y la Entrega lleva veinte
      // parámetros: su nombre no llega a verse. Solo estas dos llamadas usan PostgREST aquí.
      ['pgrst_source'],
      () => Promise.all([courierRpc(a), call(transfer, b, { challengeId: proof.challengeId })]),
    )
    const body = await created.json()
    if (created.status === 200) {
      expect(moved.status).toBe(409)
      expect((await moved.json()).detail).toBe(
        'Ese número tiene un pedido en curso. Intenta cuando termine.',
      )
      expect((await profile(a))?.phone_verified_at).not.toBeNull()
    } else {
      expect(JSON.stringify(body)).toMatch(/courier_phone_not_verified/)
      expect(moved.status).toBe(200)
      expect((await profile(a))?.phone_verified_at).toBeNull()
      const { count } = await db
        .from('courier_orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_user_id', a.id)
        .throwOnError()
      expect(count).toBe(0)
    }
  })

  it('CAX-002 · la migración desverifica los duplicados, se reaplica sin cambios y rechaza datos inválidos sin efectos', async () => {
    const a = await customer()
    const b = await customer()
    const bad = await customer()
    const shared = phone()
    const migration = readFileSync(MIGRATION_0277, 'utf8')
    const counts = (tag: string) =>
      `select '${tag}|' || (select count(*) from public.customer_profiles where user_id in ('${a.id}', '${b.id}') and phone_verified_at is not null)` +
      ` || '|' || (select count(*) from public.phone_assignments where user_id in ('${a.id}', '${b.id}') and end_reason = 'duplicate_cleared' and phone = '+51${shared}')` +
      ` || '|' || (select count(*) from public.phone_assignments)` +
      ` || '|' || (select count(*) from public.phone_assignments where ended_at is null)` +
      ` || '|' || (select count(*) from public.customer_profiles where phone_verified_at is not null)` +
      ` || '|' || (select count(*) from public.phone_restrictions);`
    // Base local desechable; todo va dentro de una transacción que se revierte.
    const output = execFileSync('docker', PSQL, {
      input: [
        'begin;',
        'drop index public.customer_profiles_verified_phone_unique;',
        `update public.customer_profiles set phone = '+51${shared}', phone_verified_at = now() where user_id in ('${a.id}', '${b.id}');`,
        counts('ANTES'),
        migration,
        counts('UNA'),
        migration,
        counts('DOS'),
        'rollback;',
      ].join('\n'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const line = (tag: string) =>
      output
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${tag}|`))
        ?.split('|')
        .slice(1)
        .map(Number)
    expect(line('ANTES')?.slice(0, 2)).toEqual([2, 0])
    const once = line('UNA')
    expect(once?.slice(0, 2)).toEqual([0, 2])
    expect(line('DOS')).toEqual(once)
    // Un teléfono verificado fuera de E.164: la migración falla entera y no deja nada.
    let failure = ''
    try {
      execFileSync('docker', PSQL, {
        input: [
          'begin;',
          'alter table public.customer_profiles drop constraint customer_profiles_phone_e164;',
          `update public.customer_profiles set phone = '${phone()}', phone_verified_at = now() where user_id = '${bad.id}';`,
          migration,
          'commit;',
        ].join('\n'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      failure = String((error as { stderr?: string }).stderr ?? error)
    }
    expect(failure).toMatch(/0277: hay teléfonos verificados fuera de E.164/)
    expect(await profile(bad)).toMatchObject({ phone: null, phone_verified_at: null })
    const kept = execFileSync('docker', PSQL, {
      input: `select count(*) from pg_constraint where conname = 'customer_profiles_phone_e164';`,
      encoding: 'utf8',
    })
    expect(kept.trim()).toBe('1')
  })

  it('solo el dueño lee avisos; seen es idempotente y no toca los ajenos', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone)
    expect((await call(transfer, b, { challengeId: proof.challengeId })).status).toBe(200)
    const list = await call(notices, a, undefined, {}, 'GET')
    const body = await list.json()
    expectConforms('getCustomerSecurityNotices', 200, body)
    const items = CustomerSecurityNoticesSchema.parse(body.data)
    expect(items).toHaveLength(1)
    const id = items[0]?.id ?? ''
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(['createdAt', 'id', 'kind', 'phoneLast3'])
    expect((await (await call(notices, b, undefined, {}, 'GET')).json()).data).toEqual([])
    expect((await call(seeNotice, b, {}, { id })).status).toBe(204)
    expect((await (await call(notices, a, undefined, {}, 'GET')).json()).data).toHaveLength(1)
    const own = await a.client.from('customer_security_notices').select('*')
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)
    expect((await b.client.from('customer_security_notices').select('*')).data).toEqual([])
    expect(
      (
        await a.client
          .from('customer_security_notices')
          .update({ seen_at: new Date().toISOString() })
          .eq('id', id)
      ).error?.code,
    ).toBe('42501')
    expect((await call(seeNotice, a, {}, { id })).status).toBe(204)
    const { data: seen } = await db
      .from('customer_security_notices')
      .select('seen_at')
      .eq('id', id)
      .single()
      .throwOnError()
    const repeated = await call(seeNotice, a, {}, { id })
    expectConforms('seeCustomerSecurityNotice', 204, null)
    expect(repeated.status).toBe(204)
    expect(
      (
        await db
          .from('customer_security_notices')
          .select('seen_at')
          .eq('id', id)
          .single()
          .throwOnError()
      ).data,
    ).toEqual(seen)
    expect((await (await call(notices, a, undefined, {}, 'GET')).json()).data).toEqual([])
  })

  it('anon y authenticated no leen las tablas internas ni escriben ninguna nueva', async () => {
    const a = await customer()
    const b = await customer()
    await claim(a)
    const proof = await challenge(b, a.phone)
    await call(transfer, b, { challengeId: proof.challengeId })
    for (const client of [anon(), a.client]) {
      for (const table of [
        'phone_assignments',
        'phone_transfer_challenges',
        'phone_restrictions',
      ] as const) {
        const read = await client.from(table).select('*')
        expect(read.data ?? []).toEqual([])
        expect(read.error === null || read.error.code === '42501').toBe(true)
        const values =
          table === 'phone_assignments'
            ? { phone: `+51${a.phone}`, user_id: a.id, start_reason: 'verification' }
            : table === 'phone_transfer_challenges'
              ? { phone: `+51${a.phone}`, user_id: a.id, assignment_id: crypto.randomUUID() }
              : { phone: a.phone, kind: 'blocked', source: 'transfer' }
        // Fetch mantiene el cuerpo propio de cada tabla sin falsear sus tipos.
        const insert = await fetch(`${URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: ANON_KEY,
            authorization: `Bearer ${client === a.client ? a.token : ANON_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(values),
        })
        expect([401, 403]).toContain(insert.status)
        expect((await insert.json()).code).toBe('42501')
        expect((await client.from(table).delete().eq('id', crypto.randomUUID())).error?.code).toBe(
          '42501',
        )
        expect(
          (await client.from(table).update({ phone: a.phone }).eq('id', crypto.randomUUID())).error
            ?.code,
        ).toBe('42501')
      }
      expect(
        (
          await client
            .from('customer_security_notices')
            .insert({ user_id: a.id, kind: 'phone_moved', phone_last3: '123' })
        ).error?.code,
      ).toBe('42501')
      expect(
        (await client.rpc('claim_customer_phone', { p_user_id: a.id, p_phone: `+51${a.phone}` }))
          .error?.code,
      ).toBe('42501')
    }
  })

  it('cada firma tocada tiene una sola fila; PostgREST resuelve todas sin PGRST203', async () => {
    const names = [
      'claim_customer_phone',
      'create_courier_order',
      'create_customer_order',
      'customer_contraentrega_decision',
      'customer_is_blocked',
      'customer_requires_prepayment',
      'push_event_types',
    ]
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
        input: `select p.proname || '|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${names.map((n) => `'${n}'`).join(',')}) group by p.proname order by p.proname;`,
        encoding: 'utf8',
      },
    )
    expect(output.trim().split(/\r?\n/)).toEqual(names.map((n) => `${n}|1`))
    const listed = execFileSync(
      'docker',
      ['exec', '-i', 'supabase_db_zpnipajgwfthxhdtzhly', 'psql', '-U', 'postgres', '-At'],
      {
        input: `select 'CustomerPhoneMoved' = any (public.push_event_types());`,
        encoding: 'utf8',
      },
    )
    expect(listed.trim()).toBe('t')
    const a = await customer()
    await claim(a)
    expect(
      (await db.rpc('customer_is_blocked', { p_user_id: a.id, p_phone: a.phone }).throwOnError())
        .data,
    ).toBe(false)
    expect(
      (
        await db
          .rpc('customer_requires_prepayment', {
            p_user_id: a.id,
            p_phone: a.phone,
            p_reference: '',
          })
          .throwOnError()
      ).data,
    ).toBe(false)
    expect(
      (await db.rpc('customer_contraentrega_decision', { p_customer_user_id: a.id }).throwOnError())
        .data,
    ).toBe('no_history')
    const result = await courierRpc(a)
    expect(result.status).toBe(200)
    expect(await result.json()).toBeTruthy()
    // Como en 0272, la lista solo la usa el trigger: ni el servicio puede llamarla.
    const pushTypes = await fetch(`${URL}/rest/v1/rpc/push_event_types`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(pushTypes.status).toBe(403)
  })
})
