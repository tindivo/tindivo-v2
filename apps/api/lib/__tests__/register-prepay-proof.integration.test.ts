/**
 * `register_prepay_proof` (0248) y la inmutabilidad del comprobante (0249).
 *
 * QUÉ AMARRA
 *  · Una sola transacción: estado, comprobante, rastro y evento del outbox
 *    (`domain_events`) quedan juntos, o no queda nada (H-2, invariante 4).
 *  · Los rechazos no dejan rastro: ni cambio de estado ni evento.
 *  · Dos comprobantes simultáneos: uno gana, hay un solo evento.
 *  · Un comprobante registrado no se cambia: ni por la RPC (ya no está en
 *    `awaiting_payment`) ni por un UPDATE directo (trigger 0249), salvo un
 *    intento nuevo.
 *  · Permisos: ni `anon` ni `authenticated` pueden llamar a la RPC.
 */
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient as db, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000000003'
const OTHER_CUSTOMER = 'e2e00000-0000-4000-8000-000000000004'
const EVENT = 'OrderPrepayProofUploaded'

const sembrados: SeededOrder[] = []

async function pedido(
  status: 'awaiting_payment' | 'pending_acceptance' = 'awaiting_payment',
  attempt = 0,
) {
  const seed = await seedPrepaidOrder({ status, validationContext: 'proof', proofAttempt: attempt })
  sembrados.push(seed)
  await db.from('orders').update({ customer_user_id: CUSTOMER }).eq('id', seed.orderId)
  return seed.orderId
}

const registrar = (id: string, path: string, user = CUSTOMER) =>
  db.rpc('register_prepay_proof', { p_order_id: id, p_customer_user_id: user, p_path: path })

async function leer(id: string) {
  const { data } = await db
    .from('orders')
    .select('status,proof_attempt,comprobante_prepago_url,payment_proof_status')
    .eq('id', id)
    .single()
  return data
}

async function eventos(id: string) {
  const { data } = await db
    .from('domain_events')
    .select('event_type,payload')
    .eq('aggregate_id', id)
    .eq('event_type', EVENT)
  return data ?? []
}

async function rastro(id: string) {
  const { data } = await db.from('order_event_log').select('id').eq('order_id', id)
  return data ?? []
}

afterEach(async () => {
  while (sembrados.length) {
    const s = sembrados.pop()
    if (s) {
      await db.from('order_event_log').delete().eq('order_id', s.orderId)
      await cleanup(s)
    }
  }
})

describe('register_prepay_proof: una sola transacción', () => {
  it('registra comprobante, estado, rastro y evento del outbox juntos', async () => {
    const id = await pedido()
    const { error } = await registrar(id, `${CUSTOMER}/ok.jpg`)
    expect(error).toBeNull()

    const o = await leer(id)
    expect(o).toMatchObject({
      status: 'validando',
      proof_attempt: 1,
      comprobante_prepago_url: `${CUSTOMER}/ok.jpg`,
      payment_proof_status: 'pending',
    })
    const ev = await eventos(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.payload).toMatchObject({ status: 'validando', attempt: 1 })
    expect(await rastro(id)).toHaveLength(1)
  })

  it('un pedido ajeno responde como inexistente y no deja rastro', async () => {
    const id = await pedido()
    const { error } = await registrar(id, `${OTHER_CUSTOMER}/x.jpg`, OTHER_CUSTOMER)
    expect(error?.code).toBe('P0002')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
    expect(await rastro(id)).toHaveLength(0)
  })

  it('una ruta fuera de la carpeta del cliente se rechaza sin tocar nada', async () => {
    const id = await pedido()
    const { error } = await registrar(id, `${OTHER_CUSTOMER}/x.jpg`)
    expect(error?.code).toBe('P0001')
    expect(error?.hint).toBe('invalid_proof_path')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })

  it('un pedido que no espera comprobante se rechaza sin tocar nada', async () => {
    const id = await pedido('pending_acceptance')
    const { error } = await registrar(id, `${CUSTOMER}/x.jpg`)
    expect(error?.hint).toBe('order_not_awaiting_proof')
    expect((await leer(id))?.status).toBe('pending_acceptance')
    expect(await eventos(id)).toHaveLength(0)
    expect(await rastro(id)).toHaveLength(0)
  })

  it('con dos intentos gastados no hay un tercero', async () => {
    const id = await pedido('awaiting_payment', 2)
    const { error } = await registrar(id, `${CUSTOMER}/x.jpg`)
    expect(error?.hint).toBe('proof_attempts_exhausted')
    expect((await leer(id))?.proof_attempt).toBe(2)
    expect(await eventos(id)).toHaveLength(0)
  })

  it('dos llamadas simultáneas: gana una y queda un solo evento', async () => {
    const id = await pedido()
    const [a, b] = await Promise.all([
      registrar(id, `${CUSTOMER}/a.jpg`),
      registrar(id, `${CUSTOMER}/b.jpg`),
    ])
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1)
    expect((await leer(id))?.proof_attempt).toBe(1)
    expect(await eventos(id)).toHaveLength(1)
    expect(await rastro(id)).toHaveLength(1)
  })
})

describe('un comprobante registrado no se cambia', () => {
  it('la RPC no deja reemplazarlo: el pedido ya está en validando', async () => {
    const id = await pedido()
    await registrar(id, `${CUSTOMER}/uno.jpg`)
    const { error } = await registrar(id, `${CUSTOMER}/dos.jpg`)
    expect(error?.hint).toBe('order_not_awaiting_proof')
    expect((await leer(id))?.comprobante_prepago_url).toBe(`${CUSTOMER}/uno.jpg`)
    expect(await eventos(id)).toHaveLength(1)
  })

  it('un UPDATE directo no puede sustituirlo ni borrarlo', async () => {
    const id = await pedido()
    await registrar(id, `${CUSTOMER}/uno.jpg`)

    const cambiar = await db
      .from('orders')
      .update({ comprobante_prepago_url: 'otro.jpg' })
      .eq('id', id)
    expect(cambiar.error?.hint).toBe('proof_immutable')
    const borrar = await db.from('orders').update({ comprobante_prepago_url: null }).eq('id', id)
    expect(borrar.error?.hint).toBe('proof_immutable')
    expect((await leer(id))?.comprobante_prepago_url).toBe(`${CUSTOMER}/uno.jpg`)
  })

  it('un intento nuevo (tras el rechazo de la cajera) sí puede traer el suyo', async () => {
    const id = await pedido()
    await registrar(id, `${CUSTOMER}/uno.jpg`)
    // La cajera rechaza y el pedido vuelve a esperar pago (como validate_order).
    await db.from('orders').update({ status: 'awaiting_payment' }).eq('id', id)
    const { error } = await registrar(id, `${CUSTOMER}/dos.jpg`)
    expect(error).toBeNull()
    const o = await leer(id)
    expect(o?.proof_attempt).toBe(2)
    expect(o?.comprobante_prepago_url).toBe(`${CUSTOMER}/dos.jpg`)
    expect(await eventos(id)).toHaveLength(2)
  })
})

describe('permisos de register_prepay_proof', () => {
  let customerClient: ReturnType<typeof createClient>
  const anonClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  beforeAll(async () => {
    customerClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await customerClient.auth.signInWithPassword({
      email: 'cliente@e2e.local',
      password: 'e2e-password-12345',
    })
    if (error) throw new Error(`login cliente e2e: ${error.message}. Corre \`pnpm db:seed:e2e\`.`)
  })

  it.each([
    ['anon', () => anonClient],
    ['authenticated', () => customerClient],
  ])('%s no puede ejecutarla', async (_rol, cliente) => {
    const id = await pedido()
    const { error } = await cliente().rpc('register_prepay_proof', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
      p_path: `${CUSTOMER}/x.jpg`,
    })
    expect(error).not.toBeNull()
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })
})
