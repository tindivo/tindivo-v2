/**
 * La carrera del comprobante de prepago (hallazgos H-1 y H-2 del contrato REST).
 *
 * Se ejerce el handler real de `POST /customer/orders/[id]/prepay-proof` con un
 * JWT real del cliente del mundo e2e, contra la base local.
 *
 * QUÉ AMARRA
 *  · C2: el `UPDATE` va condicionado al estado. Si el cron de vencimiento
 *    (`cancel_expired_prepay_orders`) canceló el pedido, el comprobante NO lo
 *    resucita a `validando`: responde 409 con `invalid_state_transition` y no
 *    emite avisos.
 *  · Repetición: un segundo POST sobre un pedido que ya está en `validando`
 *    responde 409, no suma intento y no vuelve a avisar.
 */
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, localClient as db, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'

// Los avisos viajan por Inngest; aquí solo importa SI se emiten.
const avisos = vi.hoisted(() => ({
  proofUploaded: vi.fn(async () => ({})),
  validation: vi.fn(async () => ({})),
}))
vi.mock('@/lib/inngest/client', () => ({
  sendOrderPrepayProofUploaded: avisos.proofUploaded,
  sendOrderValidation: avisos.validation,
}))

// Gancho para provocar la carrera: corre justo DESPUÉS de que la ruta lee el pedido.
const carrera = vi.hoisted(() => ({ trasLectura: null as null | (() => Promise<void>) }))
vi.mock('@/lib/supabase/service', async () => {
  const real = await vi.importActual<typeof import('@/lib/supabase/service')>(
    '@/lib/supabase/service',
  )
  // biome-ignore lint/suspicious/noExplicitAny: proxy genérico sobre el builder de PostgREST
  const envolver = (obj: any, tabla: string): any =>
    new Proxy(obj, {
      get(target, prop) {
        const v = target[prop]
        if (tabla === 'orders' && prop === 'maybeSingle' && typeof v === 'function') {
          return async () => {
            const r = await v.call(target)
            const h = carrera.trasLectura
            carrera.trasLectura = null
            if (h) await h()
            return r
          }
        }
        if (typeof v === 'function') {
          return (...args: unknown[]) => {
            const out = v.apply(target, args)
            return out && typeof out === 'object' && 'select' in out ? envolver(out, tabla) : out
          }
        }
        return v
      },
    })
  return {
    ...real,
    createServiceClient: () => {
      const c = real.createServiceClient()
      return new Proxy(c, {
        get(target, prop) {
          const v = (target as never)[prop]
          if (prop === 'from') return (t: string) => envolver((target as never as { from: (t: string) => object }).from(t), t)
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
        },
      })
    },
  }
})

import { POST } from '../../app/api/v1/customer/orders/[id]/prepay-proof/route'

let accessToken = ''
const sembrados: SeededOrder[] = []

function proofRequest(orderId: string, path: string) {
  return POST(
    new Request(`${LOCAL_URL}/api/v1/customer/orders/${orderId}/prepay-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ path }),
    }),
    { params: Promise.resolve({ id: orderId }) },
  )
}

/** Pedido prepago esperando el pago, del cliente e2e. */
async function pedidoEsperandoPago(proofAttempt = 0): Promise<string> {
  const seed = await seedPrepaidOrder({
    status: 'awaiting_payment',
    validationContext: 'proof',
    proofAttempt,
  })
  sembrados.push(seed)
  const { error } = await db
    .from('orders')
    .update({ customer_user_id: CUSTOMER_USER_ID })
    .eq('id', seed.orderId)
  if (error) throw new Error(`no se pudo ligar el pedido al cliente: ${error.message}`)
  return seed.orderId
}

async function leer(orderId: string) {
  const { data } = await db
    .from('orders')
    .select('status,proof_attempt,comprobante_prepago_url,payment_proof_status,cancel_reason')
    .eq('id', orderId)
    .single()
  return data
}

/** Lo que hace el cron cada minuto, sobre un pedido cuyo plazo de pago ya pasó. */
async function vencerPlazoDePago(orderId: string) {
  const { error: e1 } = await db
    .from('orders')
    .update({ awaiting_payment_at: new Date(Date.now() - 60 * 60_000).toISOString() })
    .eq('id', orderId)
  if (e1) throw new Error(e1.message)
  const { error } = await db.rpc('cancel_expired_prepay_orders')
  if (error) throw new Error(`cancel_expired_prepay_orders: ${error.message}`)
}

describe('comprobante de prepago: la carrera con el vencimiento y la repetición', () => {
  beforeAll(async () => {
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.auth.signInWithPassword({
      email: 'cliente@e2e.local',
      password: 'e2e-password-12345',
    })
    if (error || !data.session) {
      throw new Error(
        `No se pudo autenticar al cliente e2e: ${error?.message}. Corre \`pnpm db:seed:e2e\`.`,
      )
    }
    accessToken = data.session.access_token
  })

  beforeEach(() => {
    avisos.proofUploaded.mockClear()
    avisos.validation.mockClear()
  })

  afterEach(async () => {
    while (sembrados.length) {
      const s = sembrados.pop()
      if (s) {
        await db.from('order_event_log').delete().eq('order_id', s.orderId)
        await cleanup(s)
      }
    }
  })

  it('camino feliz: awaiting_payment pasa a validando y avisa una vez', async () => {
    const id = await pedidoEsperandoPago()
    const res = await proofRequest(id, `${CUSTOMER_USER_ID}/a.jpg`)
    expect(res.status).toBe(200)
    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(o?.comprobante_prepago_url).toBe(`${CUSTOMER_USER_ID}/a.jpg`)
    expect(avisos.proofUploaded).toHaveBeenCalledTimes(1)
    expect(avisos.validation).toHaveBeenCalledTimes(1)
  })

  it('el plazo de pago venció (el cron canceló): 409, el pedido sigue cancelado y no se avisa', async () => {
    const id = await pedidoEsperandoPago()
    await vencerPlazoDePago(id)
    expect((await leer(id))?.status).toBe('cancelled')

    const res = await proofRequest(id, `${CUSTOMER_USER_ID}/tarde.jpg`)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')

    const o = await leer(id)
    expect(o?.status).toBe('cancelled')
    expect(o?.cancel_reason).toBe('prepay_timeout')
    expect(o?.proof_attempt).toBe(0)
    expect(o?.comprobante_prepago_url).toBeNull()
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
    expect(avisos.validation).not.toHaveBeenCalled()
  })

  it('el cron cancela ENTRE la lectura y la escritura: no se resucita a validando', async () => {
    const id = await pedidoEsperandoPago()
    let disparado = false
    carrera.trasLectura = async () => {
      disparado = true
      await vencerPlazoDePago(id)
    }

    const res = await proofRequest(id, `${CUSTOMER_USER_ID}/carrera.jpg`)
    expect(disparado).toBe(true) // la carrera ocurrió de verdad
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')

    const o = await leer(id)
    expect(o?.status).toBe('cancelled')
    expect(o?.comprobante_prepago_url).toBeNull()
    expect(o?.proof_attempt).toBe(0)
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
    expect(avisos.validation).not.toHaveBeenCalled()
    const { data: log } = await db.from('order_event_log').select('id').eq('order_id', id)
    expect(log ?? []).toHaveLength(0)
  })

  it('repetición: el segundo comprobante sobre un pedido en validando responde 409 y no cambia nada', async () => {
    const id = await pedidoEsperandoPago()
    expect((await proofRequest(id, `${CUSTOMER_USER_ID}/uno.jpg`)).status).toBe(200)
    avisos.proofUploaded.mockClear()
    avisos.validation.mockClear()

    const res = await proofRequest(id, `${CUSTOMER_USER_ID}/dos.jpg`)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')

    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(o?.comprobante_prepago_url).toBe(`${CUSTOMER_USER_ID}/uno.jpg`)
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
    expect(avisos.validation).not.toHaveBeenCalled()
  })

  it('dos comprobantes a la vez: gana uno, el otro recibe 409 y se avisa una sola vez', async () => {
    const id = await pedidoEsperandoPago()
    const [a, b] = await Promise.all([
      proofRequest(id, `${CUSTOMER_USER_ID}/a.jpg`),
      proofRequest(id, `${CUSTOMER_USER_ID}/b.jpg`),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(avisos.proofUploaded).toHaveBeenCalledTimes(1)
  })
})
