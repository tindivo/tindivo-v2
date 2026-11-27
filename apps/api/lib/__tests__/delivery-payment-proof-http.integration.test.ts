/**
 * Pago único del cliente de confianza (0296) por la capa HTTP real: handler + JWT de usuarios del
 * seed e2e + base local. Las RPC tienen su propia suite (`delivery-payment-proof.integration.test.ts`);
 * aquí se amarra lo que solo se ve de punta a punta: quién entra, con qué código sale cada negativa
 * y que el prepago sigue por su camino.
 *
 * QUÉ AMARRA
 *  · El cliente dueño pide la URL de subida, sube y registra la captura; el `status` NO cambia.
 *  · Con el pedido sin aceptar la subida responde 409 y no se registra nada.
 *  · Otro cliente recibe 404 en las tres rutas del cliente (no se enumeran pedidos).
 *  · `prepay-info` trae `proofOptional`, `canUploadProof`, `totalText` y `currency`.
 *  · Un prepago sigue su camino: la captura lo pasa a `validando`.
 *  · Solo el dueño del negocio confirma o rechaza; otro negocio no ve el pedido.
 *  · Solo el motorizado asignado ve la captura, y no cuando el pedido ya se entregó.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

vi.mock('@/lib/inngest/client', () => ({
  sendOrderPrepayProofUploaded: vi.fn(async () => ({})),
  sendOrderValidation: vi.fn(async () => ({})),
}))

import { POST as confirmPayment } from '../../app/api/v1/business/orders/[id]/payment-confirmation/route'
import { POST as rejectProof } from '../../app/api/v1/business/orders/[id]/payment-proof/reject/route'
import { GET as getPrepayInfo } from '../../app/api/v1/customer/orders/[id]/prepay-info/route'
import { POST as confirmProof } from '../../app/api/v1/customer/orders/[id]/prepay-proof/route'
import { POST as createUploadUrl } from '../../app/api/v1/customer/orders/[id]/prepay-proof/upload-url/route'
import { GET as getDriverProof } from '../../app/api/v1/driver/orders/[id]/prepay-proof/route'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import {
  cleanup,
  localClient as db,
  E2E,
  removeProofObjects,
  type SeededOrder,
  seedPrepaidOrder,
  setOrderStatus,
  uploadProofObject,
} from './helpers/local-db'

const CUSTOMER = FIXTURES.CUSTOMER_USER_ID

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

type Cuerpo = { data?: Record<string, unknown> }

const tokens: Record<string, string> = {}
const sembrados: SeededOrder[] = []

async function entrar(email: string): Promise<string> {
  // Cliente aparte: `signInWithPassword` sustituiría la sesión de `localClient`.
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: FIXTURES.PASSWORD,
  })
  if (error || !data.session) throw new Error(`No se pudo entrar como ${email}: ${error?.message}`)
  return data.session.access_token
}

async function llamar(
  handler: Handler,
  method: 'GET' | 'POST',
  id: string,
  ruta: string,
  bearer: string,
  body?: unknown,
) {
  const res = await handler(
    new Request(`${LOCAL_URL}/api/v1/${ruta}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Cuerpo | null }
}

const pedirUrl = (id: string, bearer = tokens.cliente as string) =>
  llamar(createUploadUrl, 'POST', id, `customer/orders/${id}/prepay-proof/upload-url`, bearer, {
    contentType: 'image/png',
  })
const registrarPath = (id: string, path: string, bearer = tokens.cliente as string) =>
  llamar(confirmProof, 'POST', id, `customer/orders/${id}/prepay-proof`, bearer, { path })
const info = (id: string, bearer = tokens.cliente as string) =>
  llamar(getPrepayInfo, 'GET', id, `customer/orders/${id}/prepay-info`, bearer)
const confirmar = (id: string, bearer = tokens.negocio as string) =>
  llamar(confirmPayment, 'POST', id, `business/orders/${id}/payment-confirmation`, bearer)
const rechazar = (id: string, attempt: number, bearer = tokens.negocio as string) =>
  llamar(rejectProof, 'POST', id, `business/orders/${id}/payment-proof/reject`, bearer, {
    attempt,
    reasonCode: 'invalid_proof',
  })
const verCaptura = (id: string, bearer = tokens.motorizado as string) =>
  llamar(getDriverProof, 'GET', id, `driver/orders/${id}/prepay-proof`, bearer)

/**
 * Un pedido con entrega de pago único del cliente e2e, del negocio e2e (para que su dueño real
 * pueda confirmar), ya aceptado por el negocio (por defecto `preparing`).
 */
async function pedido(estado: 'pending_acceptance' | 'preparing' | 'picked_up' = 'preparing') {
  const seed = await seedPrepaidOrder({
    paymentIntent: 'pending_yape',
    status: 'pending_acceptance',
  })
  sembrados.push(seed)
  const { error } = await db
    .from('orders')
    .update({ customer_user_id: CUSTOMER, business_id: E2E.BUSINESS_ID })
    .eq('id', seed.orderId)
  if (error) throw new Error(`no se pudo ligar el pedido al cliente: ${error.message}`)
  if (estado !== 'pending_acceptance') {
    await setOrderStatus(seed.orderId, 'confirmed')
    if (estado !== 'confirmed') await setOrderStatus(seed.orderId, estado)
  }
  return seed.orderId
}

async function leer(id: string) {
  const { data } = await db
    .from('orders')
    .select('status,proof_attempt,comprobante_prepago_url,payment_proof_status,payment_verified_at')
    .eq('id', id)
    .single()
  return data
}

/** Sube un archivo con la URL firmada que dio la API, como la app, y devuelve el `path`. */
async function subirConLaUrl(id: string): Promise<string> {
  const { status, body } = await pedirUrl(id)
  expect(status).toBe(200)
  const data = body?.data as { path: string; uploadUrl: string }
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  })
  expect(put.status).toBe(200)
  return data.path
}

beforeAll(async () => {
  tokens.cliente = await entrar(FIXTURES.CUSTOMER_EMAIL)
  tokens.cliente2 = await entrar('cliente2@e2e.local')
  tokens.negocio = await entrar(FIXTURES.BUSINESS_EMAIL)
  tokens.negocio2 = await entrar(FIXTURES.BUSINESS_2_EMAIL)
  tokens.motorizado = await entrar(FIXTURES.DRIVER_EMAIL)
  tokens.motorizado2 = await entrar(FIXTURES.DRIVER_2_EMAIL)
})

afterEach(async () => {
  while (sembrados.length) {
    const s = sembrados.pop()
    if (s) {
      await db.from('order_event_log').delete().eq('order_id', s.orderId)
      await removeProofObjects(CUSTOMER, s.orderId)
      await cleanup(s)
    }
  }
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe('el cliente y su captura del pago único', () => {
  it('pide la URL, sube, registra y el status del pedido NO cambia', async () => {
    const id = await pedido('preparing')
    const path = await subirConLaUrl(id)
    expect(path).toMatch(new RegExp(`^${CUSTOMER}/${id}/attempt-1-`))

    const res = await registrarPath(id, path)
    expect(res.status).toBe(200)
    expect(await leer(id)).toMatchObject({
      status: 'preparing',
      proof_attempt: 1,
      comprobante_prepago_url: path,
      payment_proof_status: 'pending',
      payment_verified_at: null,
    })
  })

  it('con el pedido sin aceptar, la URL responde 409 y no se registra nada', async () => {
    const id = await pedido('pending_acceptance')
    const res = await pedirUrl(id)
    expect(res.status).toBe(409)
    expect(await leer(id)).toMatchObject({
      status: 'pending_acceptance',
      proof_attempt: 0,
      comprobante_prepago_url: null,
    })
  })

  it('otro cliente recibe 404 en la URL, en el registro y en prepay-info', async () => {
    const id = await pedido('preparing')
    const path = await uploadProofObject(CUSTOMER, id, 1)
    const ajeno = tokens.cliente2 as string
    const ajenoId = JSON.parse(Buffer.from(ajeno.split('.')[1] ?? '', 'base64url').toString()).sub
    expect((await pedirUrl(id, ajeno)).status).toBe(404)
    // Con la ruta del dueño, la guarda de la ruta responde 403 ANTES de leer el pedido (no
    // revela si existe); con una ruta dentro de su propia carpeta, el pedido ajeno es 404.
    expect((await registrarPath(id, path, ajeno)).status).toBe(403)
    const inexistente = crypto.randomUUID()
    expect((await registrarPath(inexistente, path, ajeno)).status).toBe(403)
    expect((await registrarPath(id, `${ajenoId}/${id}/attempt-1-x.jpg`, ajeno)).status).toBe(404)
    expect((await info(id, ajeno)).status).toBe(404)
    expect((await leer(id))?.proof_attempt).toBe(0)
  })

  it('prepay-info del dueño trae proofOptional, canUploadProof, totalText y currency', async () => {
    const id = await pedido('preparing')
    const res = await info(id)
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({
      proofOptional: true,
      canUploadProof: true,
      totalText: '53.00',
      currency: 'PEN',
      paymentVerifiedAt: null,
    })
  })

  it('un prepago sigue por su camino: la captura lo pasa a validando', async () => {
    const seed = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
    sembrados.push(seed)
    await db.from('orders').update({ customer_user_id: CUSTOMER }).eq('id', seed.orderId)

    expect((await info(seed.orderId)).body?.data).toMatchObject({
      proofOptional: false,
      canUploadProof: true,
    })
    const path = await subirConLaUrl(seed.orderId)
    const res = await registrarPath(seed.orderId, path)
    expect(res.status).toBe(200)
    expect(await leer(seed.orderId)).toMatchObject({
      status: 'validando',
      comprobante_prepago_url: path,
    })
  })
})

describe('el negocio confirma o rechaza', () => {
  it('el dueño confirma: 200 y verified; otro negocio no ve el pedido y no cambia nada', async () => {
    const id = await pedido('preparing')

    const ajeno = await confirmar(id, tokens.negocio2 as string)
    expect([403, 404]).toContain(ajeno.status)
    expect((await leer(id))?.payment_verified_at).toBeNull()

    const res = await confirmar(id)
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({ status: 'preparing', paymentProofStatus: 'verified' })
    expect(await leer(id)).toMatchObject({
      status: 'preparing',
      payment_proof_status: 'verified',
    })
  })

  it('el dueño rechaza el intento vigente (200); con otro intento, 409', async () => {
    const id = await pedido('preparing')
    expect((await registrarPath(id, await subirConLaUrl(id))).status).toBe(200)

    const otro = await rechazar(id, 2)
    expect(otro.status).toBe(409)
    expect((await leer(id))?.payment_proof_status).toBe('pending')

    const res = await rechazar(id, 1)
    expect(res.status).toBe(200)
    expect(await leer(id)).toMatchObject({ status: 'preparing', payment_proof_status: 'rejected' })
  })

  it('otro negocio no rechaza el pedido ajeno', async () => {
    const id = await pedido('preparing')
    expect((await registrarPath(id, await subirConLaUrl(id))).status).toBe(200)
    const res = await rechazar(id, 1, tokens.negocio2 as string)
    expect([403, 404]).toContain(res.status)
    expect((await leer(id))?.payment_proof_status).toBe('pending')
  })
})

describe('el motorizado ve la captura', () => {
  it('el asignado recibe una URL de 120 s; otro motorizado, 404; tras entregar, 404', async () => {
    const id = await pedido('preparing')
    await db.from('orders').update({ driver_id: E2E.DRIVER_ID }).eq('id', id)
    expect((await registrarPath(id, await subirConLaUrl(id))).status).toBe(200)

    const mia = await verCaptura(id)
    expect(mia.status).toBe(200)
    expect(mia.body?.data).toMatchObject({ expiresInSeconds: 120, paymentProofStatus: 'pending' })
    expect(typeof mia.body?.data?.url).toBe('string')

    expect((await verCaptura(id, tokens.motorizado2 as string)).status).toBe(404)

    await setOrderStatus(id, 'delivered')
    expect((await verCaptura(id)).status).toBe(404)
  })
})
