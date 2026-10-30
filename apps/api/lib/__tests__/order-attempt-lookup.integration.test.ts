/**
 * GET /customer/orders/attempts/{key}: reconciliar una creación cuya respuesta
 * se perdió. La fila de `creation_idempotency` nace en la misma transacción que
 * el pedido (0251), así que su presencia prueba que el pedido existe.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { GET } from '../../app/api/v1/customer/orders/attempts/[key]/route'
import { createIdempotently } from '../http/idempotency'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const CLAVE = 'test-password-12345'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

interface Cliente {
  id: string
  tel9: string
  token: string
}

const clientes: Cliente[] = []
const pedidos: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const email = `attempt-${tel9}@integration.local`
  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Intento' },
  })
  if (error) throw new Error(`no se pudo crear el auth user: ${error.message}`)
  const { error: perr } = await db.from('customer_profiles').insert({
    user_id: auth.user.id,
    full_name: 'Vecino Intento',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (perr) throw new Error(`no se pudo crear el perfil: ${perr.message}`)
  await db.from('user_roles').insert({ user_id: auth.user.id, role: 'customer' })
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ses, error: lerr } = await anon.auth.signInWithPassword({
    email,
    password: CLAVE,
  })
  if (lerr || !ses.session) throw new Error(`login falló: ${lerr?.message}`)
  const c = { id: auth.user.id, tel9, token: ses.session.access_token }
  clientes.push(c)
  return c
}

function argsPedido(c: Cliente) {
  return {
    p_customer_user_id: c.id,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'pickup',
    p_payment_intent: 'prepaid',
    p_customer_name: 'Vecino',
    p_customer_phone: c.tel9,
    p_delivery_address: '',
    p_delivery_reference: '',
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_pickup_timing: 'now',
  }
}

async function crearPedido(c: Cliente, key: string) {
  const r = await createIdempotently(db, {
    userId: c.id,
    scope: 'create_order',
    key,
    requestHash: 'hash-a',
    args: argsPedido(c),
  })
  expect(r.error, r.error?.message).toBeNull()
  const creado = r.data?.data as { id: string; shortId: string }
  pedidos.push(creado.id)
  return creado
}

async function borrarPedido(id: string) {
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('order_event_log').delete().eq('order_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('business_charges').delete().eq('order_id', id)
  await db.from('customer_strikes').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
}

function consultar(key: string, token: string | null) {
  return GET(
    new Request(`${LOCAL_URL}/api/v1/customer/orders/attempts/${key}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ key }) },
  )
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

describe('GET /customer/orders/attempts/{key}', () => {
  it('una clave que creó un pedido responde created con id y shortId correctos, sin caché', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const creado = await crearPedido(c, key)

    const res = await consultar(key, c.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({
      data: { state: 'created', order: { id: creado.id, shortId: creado.shortId } },
    })
  })

  it('si la respuesta guardada no trae shortId, lo lee del pedido del cliente', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const creado = await crearPedido(c, key)
    await db
      .from('creation_idempotency')
      .update({ response: {} })
      .eq('user_id', c.id)
      .eq('key', key)

    const { data: pedido } = await db.from('orders').select('short_id').eq('id', creado.id).single()
    const res = await consultar(key, c.token)
    expect((await res.json()).data).toEqual({
      state: 'created',
      order: { id: creado.id, shortId: pedido?.short_id },
    })
  })

  it('la clave de OTRO cliente es not_found (no se distingue de una inexistente)', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const key = crypto.randomUUID()
    await crearPedido(a, key)

    const res = await consultar(key, b.token)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ state: 'not_found', order: null })
  })

  it('una clave nunca usada es not_found, con 200', async () => {
    const c = await crearCliente()
    const res = await consultar(crypto.randomUUID(), c.token)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ state: 'not_found', order: null })
  })

  it('una fila vencida cuenta como inexistente', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    await crearPedido(c, key)
    const vencida = new Date(Date.now() - 60_000).toISOString()
    await db
      .from('creation_idempotency')
      .update({ expires_at: vencida })
      .eq('user_id', c.id)
      .eq('key', key)
    await db
      .from('idempotency_keys')
      .update({ expires_at: vencida })
      .eq('user_id', c.id)
      .eq('key', key)

    const res = await consultar(key, c.token)
    expect((await res.json()).data).toEqual({ state: 'not_found', order: null })
  })

  it('una fila legada reserved es unknown', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const { error } = await db.from('idempotency_keys').insert({
      key,
      scope: 'create_order',
      user_id: c.id,
      request_hash: 'hash-legado',
      status: 'reserved',
    })
    expect(error, error?.message).toBeNull()

    const res = await consultar(key, c.token)
    expect((await res.json()).data).toEqual({ state: 'unknown', order: null })
  })

  it('una fila legada completed es created con el id de su respuesta', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const id = crypto.randomUUID()
    const { error } = await db.from('idempotency_keys').insert({
      key,
      scope: 'create_order',
      user_id: c.id,
      request_hash: 'hash-legado',
      status: 'completed',
      response_status: 201,
      response_body: { data: { id, shortId: 'ABCD2345' } },
    })
    expect(error, error?.message).toBeNull()

    const res = await consultar(key, c.token)
    expect((await res.json()).data).toEqual({
      state: 'created',
      order: { id, shortId: 'ABCD2345' },
    })
  })

  it.each([
    [422, 'unknown'],
    [500, 'unknown'],
  ])('una fila legada completed con respuesta %i es unknown (la clave está consumida)', async (status, state) => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const { error } = await db.from('idempotency_keys').insert({
      key,
      scope: 'create_order',
      user_id: c.id,
      request_hash: 'hash-legado',
      status: 'completed',
      response_status: status,
      response_body: { type: 'about:blank' },
    })
    expect(error, error?.message).toBeNull()

    const res = await consultar(key, c.token)
    expect((await res.json()).data).toEqual({ state, order: null })
  })

  it('una clave que no es UUID es 422 validation_error', async () => {
    const c = await crearCliente()
    const res = await consultar('no-es-uuid', c.token)
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('validation_error')
  })

  it('sin token es 401', async () => {
    const res = await consultar(crypto.randomUUID(), null)
    expect(res.status).toBe(401)
  })
})
