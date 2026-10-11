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
 *  · Repetición: reconfirmar el MISMO archivo es idempotente (200, sin gastar
 *    intento ni avisar otra vez); un archivo DISTINTO responde 409.
 *  · Carrera real: el cron y el comprobante a la vez nunca dejan un pedido
 *    resucitado.
 */
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  localClient as db,
  removeProofObjects,
  type SeededOrder,
  seedPrepaidOrder,
  uploadProofObject,
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

// Los avisos viajan por Inngest; aquí solo importa SI se emiten.
const avisos = vi.hoisted(() => ({
  proofUploaded: vi.fn(async () => ({})),
  validation: vi.fn(async () => ({})),
}))
vi.mock('@/lib/inngest/client', () => ({
  sendOrderPrepayProofUploaded: avisos.proofUploaded,
  sendOrderValidation: avisos.validation,
}))

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

/** Sube un archivo de verdad, con la ruta que exige la RPC (pedido + intento). */
const ruta = (orderId: string, attempt = 1, tag?: string) =>
  uploadProofObject(CUSTOMER_USER_ID, orderId, attempt, tag)

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
        await removeProofObjects(CUSTOMER_USER_ID, s.orderId)
        await cleanup(s)
      }
    }
  })

  it('camino feliz: awaiting_payment pasa a validando y avisa una vez', async () => {
    const id = await pedidoEsperandoPago()
    const path = await ruta(id)
    const res = await proofRequest(id, path)
    expect(res.status).toBe(200)
    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(o?.comprobante_prepago_url).toBe(path)
    expect(avisos.proofUploaded).toHaveBeenCalledTimes(1)
    expect(avisos.validation).toHaveBeenCalledTimes(1)
    // H-2: el evento viaja por el outbox, en la misma transacción.
    const { data: ev } = await db
      .from('domain_events')
      .select('event_type')
      .eq('aggregate_id', id)
      .eq('event_type', 'OrderPrepayProofUploaded')
    expect(ev).toHaveLength(1)
  })

  it('el plazo de pago venció (el cron canceló): 409, el pedido sigue cancelado y no se avisa', async () => {
    const id = await pedidoEsperandoPago()
    const path = await ruta(id)
    await vencerPlazoDePago(id)
    expect((await leer(id))?.status).toBe('cancelled')

    const res = await proofRequest(id, path)
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

  it('carrera REAL: el cron y el comprobante a la vez nunca resucitan el pedido', async () => {
    const resultados = new Set<string>()
    for (let ronda = 0; ronda < 8; ronda++) {
      avisos.proofUploaded.mockClear()
      const id = await pedidoEsperandoPago()
      const path = await ruta(id)
      // El plazo ya venció: el cron QUIERE cancelar justo cuando llega el comprobante.
      await db
        .from('orders')
        .update({ awaiting_payment_at: new Date(Date.now() - 60 * 60_000).toISOString() })
        .eq('id', id)
      const [res] = await Promise.all([
        proofRequest(id, path),
        db.rpc('cancel_expired_prepay_orders'),
      ])
      const o = await leer(id)
      if (o?.status === 'cancelled') {
        // Ganó el cron: el comprobante recibe 409 y no hay rastro de él.
        expect(res.status).toBe(409)
        expect(o.comprobante_prepago_url).toBeNull()
        expect(o.proof_attempt).toBe(0)
        expect(avisos.proofUploaded).not.toHaveBeenCalled()
        resultados.add('cancelado')
      } else {
        // Ganó el comprobante: queda validando, con su intento y su aviso.
        expect(res.status).toBe(200)
        expect(o?.status).toBe('validando')
        expect(o?.proof_attempt).toBe(1)
        expect(avisos.proofUploaded).toHaveBeenCalledTimes(1)
        resultados.add('validando')
      }
    }
    // Nunca un tercer estado (p. ej. cancelado CON comprobante registrado).
    expect([...resultados].every((r) => r === 'cancelado' || r === 'validando')).toBe(true)
  })

  it('reconfirmar el MISMO archivo es idempotente: 200, sin gastar intento ni avisar otra vez', async () => {
    const id = await pedidoEsperandoPago()
    const path = await ruta(id)
    expect((await proofRequest(id, path)).status).toBe(200)
    avisos.proofUploaded.mockClear()
    avisos.validation.mockClear()

    const res = await proofRequest(id, path)
    expect(res.status).toBe(200)

    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(o?.comprobante_prepago_url).toBe(path)
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
    expect(avisos.validation).not.toHaveBeenCalled()
    const { data: ev } = await db
      .from('domain_events')
      .select('id')
      .eq('aggregate_id', id)
      .eq('event_type', 'OrderPrepayProofUploaded')
    expect(ev).toHaveLength(1)
  })

  it('otro archivo sobre un pedido en validando responde 409 y no cambia nada', async () => {
    const id = await pedidoEsperandoPago()
    const uno = await ruta(id, 1, 'uno')
    expect((await proofRequest(id, uno)).status).toBe(200)
    avisos.proofUploaded.mockClear()
    avisos.validation.mockClear()

    const res = await proofRequest(id, await ruta(id, 1, 'dos'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')

    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(o?.comprobante_prepago_url).toBe(uno)
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
    expect(avisos.validation).not.toHaveBeenCalled()
  })

  it('un archivo que no existe en Storage se rechaza sin avisar', async () => {
    const id = await pedidoEsperandoPago()
    const res = await proofRequest(id, `${CUSTOMER_USER_ID}/${id}/attempt-1-fantasma.png`)
    expect(res.status).toBe(422)
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(avisos.proofUploaded).not.toHaveBeenCalled()
  })

  it('dos comprobantes distintos a la vez: gana uno, el otro recibe 409 y se avisa una sola vez', async () => {
    const id = await pedidoEsperandoPago()
    const a = await ruta(id, 1, 'a')
    const b = await ruta(id, 1, 'b')
    const [ra, rb] = await Promise.all([proofRequest(id, a), proofRequest(id, b)])
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    const o = await leer(id)
    expect(o?.status).toBe('validando')
    expect(o?.proof_attempt).toBe(1)
    expect(avisos.proofUploaded).toHaveBeenCalledTimes(1)
  })
})
