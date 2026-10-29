/**
 * `POST /customer/orders/{id}/prepay-proof/upload-url`: el servidor autoriza la subida del
 * comprobante y la app la hace con un PUT a la URL firmada (sin el SDK de Supabase). Después
 * confirma con el `prepay-proof` de siempre. Contra la base local, con JWT reales.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  localClient as db,
  removeProofObjects,
  type SeededOrder,
  seedPrepaidOrder,
} from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'

vi.mock('@/lib/inngest/client', () => ({
  sendOrderPrepayProofUploaded: vi.fn(async () => ({})),
  sendOrderValidation: vi.fn(async () => ({})),
}))

import { POST as confirmar } from '../../app/api/v1/customer/orders/[id]/prepay-proof/route'
import { POST as pedirUrl } from '../../app/api/v1/customer/orders/[id]/prepay-proof/upload-url/route'

let token = ''
let tokenAjeno = ''
let ajenoId = ''
const sembrados: SeededOrder[] = []

async function entrar(email: string, password: string): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`No se pudo entrar como ${email}: ${error?.message}`)
  return data.session.access_token
}

function pedir(orderId: string, body: unknown, bearer: string | null = token) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (bearer) headers.authorization = `Bearer ${bearer}`
  return pedirUrl(
    new Request(`${LOCAL_URL}/api/v1/customer/orders/${orderId}/prepay-proof/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: orderId }) },
  )
}

async function pedidoDelCliente(
  opts: { status?: 'awaiting_payment' | 'validando'; proofAttempt?: number } = {},
): Promise<string> {
  const seed = await seedPrepaidOrder({
    status: opts.status ?? 'awaiting_payment',
    validationContext: 'proof',
    proofAttempt: opts.proofAttempt ?? 0,
  })
  sembrados.push(seed)
  const { error } = await db
    .from('orders')
    .update({ customer_user_id: CUSTOMER_USER_ID })
    .eq('id', seed.orderId)
  if (error) throw new Error(`no se pudo ligar el pedido al cliente: ${error.message}`)
  return seed.orderId
}

beforeAll(async () => {
  token = await entrar('cliente@e2e.local', 'e2e-password-12345')
  const email = `upload-url-${crypto.randomUUID()}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Integración' },
  })
  if (error) throw new Error(`crear el otro cliente falló: ${error.message}`)
  ajenoId = data.user.id
  await db
    .from('customer_profiles')
    .insert({
      user_id: ajenoId,
      full_name: 'Vecino Integración',
      phone: `+519${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      phone_verified_at: new Date().toISOString(),
    })
    .throwOnError()
  tokenAjeno = await entrar(email, 'test-password-12345')
})

afterEach(async () => {
  while (sembrados.length) {
    const s = sembrados.pop()
    if (s) {
      await db.from('order_event_log').delete().eq('order_id', s.orderId)
      await removeProofObjects(CUSTOMER_USER_ID, s.orderId)
      await cleanup(s)
    }
  }
})

afterAll(async () => {
  if (ajenoId) {
    await db.from('customer_profiles').delete().eq('user_id', ajenoId)
    await db.from('users').delete().eq('id', ajenoId)
    await db.auth.admin.deleteUser(ajenoId)
  }
})

describe('POST /customer/orders/{id}/prepay-proof/upload-url', () => {
  it('éxito: ruta en la carpeta del usuario y del pedido; se sube con la URL y se confirma', async () => {
    const id = await pedidoDelCliente()
    const res = await pedir(id, { contentType: 'image/png' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const { data } = await res.json()
    expect(data.path).toMatch(new RegExp(`^${CUSTOMER_USER_ID}/${id}/attempt-1-\\d+\\.png$`))
    expect(data.uploadUrl).toContain('/object/upload/sign/payment-proofs/')
    expect(typeof data.token).toBe('string')
    expect(data.expiresAt).toMatch(/Z$/)
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now())

    // La app sube con un PUT a la URL firmada, sin SDK.
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })
    expect(put.status).toBe(200)

    // Y confirma con el `prepay-proof` de siempre, con ese mismo path.
    const conf = await confirmar(
      new Request(`${LOCAL_URL}/api/v1/customer/orders/${id}/prepay-proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: data.path }),
      }),
      { params: Promise.resolve({ id }) },
    )
    expect(conf.status).toBe(200)
    const { data: o } = await db
      .from('orders')
      .select('status,comprobante_prepago_url,proof_attempt')
      .eq('id', id)
      .single()
    expect(o?.status).toBe('validando')
    expect(o?.comprobante_prepago_url).toBe(data.path)
  })

  it('segundo intento: la ruta lleva attempt-2', async () => {
    const id = await pedidoDelCliente({ proofAttempt: 1 })
    const res = await pedir(id, { contentType: 'image/jpeg' })
    expect(res.status).toBe(200)
    expect((await res.json()).data.path).toMatch(/\/attempt-2-\d+\.jpg$/)
  })

  it('no sobrescribe: subir dos veces a la misma URL firmada falla la segunda', async () => {
    const id = await pedidoDelCliente()
    const { data } = await (await pedir(id, { contentType: 'image/png' })).json()
    const subir = () =>
      fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      })
    expect((await subir()).status).toBe(200)
    expect((await subir()).status).not.toBe(200)
  })

  it('pedido de otro cliente: 404, igual que uno inexistente', async () => {
    const id = await pedidoDelCliente()
    const ajeno = await pedir(id, { contentType: 'image/png' }, tokenAjeno)
    expect(ajeno.status).toBe(404)
    expect((await ajeno.json()).code).toBe('not_found')
    const inexistente = await pedir(crypto.randomUUID(), { contentType: 'image/png' })
    expect(inexistente.status).toBe(404)
  })

  it('pedido que no espera comprobante: 409 invalid_state_transition', async () => {
    const id = await pedidoDelCliente({ status: 'validando' })
    const res = await pedir(id, { contentType: 'image/png' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')
  })

  it('intentos agotados: 403 forbidden', async () => {
    const id = await pedidoDelCliente({ proofAttempt: 2 })
    const res = await pedir(id, { contentType: 'image/png' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('forbidden')
  })

  it('contentType fuera de la lista: 422 validation_error', async () => {
    const id = await pedidoDelCliente()
    for (const contentType of ['application/pdf', 'image/gif', undefined]) {
      const res = await pedir(id, { contentType })
      expect(res.status).toBe(422)
      expect((await res.json()).code).toBe('validation_error')
    }
  })

  it('sin token: 401', async () => {
    const id = await pedidoDelCliente()
    const res = await pedir(id, { contentType: 'image/png' }, null)
    expect(res.status).toBe(401)
  })
})
