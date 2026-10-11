/**
 * `register_prepay_proof` (0248), la inmutabilidad del comprobante (0249) y la
 * policy de Storage que ya no deja sobrescribirlo (0258).
 *
 * QUÉ AMARRA
 *  · Una sola transacción: estado, comprobante, rastro y evento del outbox
 *    (`domain_events`) quedan juntos, o no queda nada (H-2, invariante 4). Si
 *    falla la escritura del evento, el pedido NO cambia de estado.
 *  · La ruta es de ESTE pedido y de ESTE intento, y el archivo EXISTE.
 *  · Los rechazos no dejan rastro: ni cambio de estado ni evento.
 *  · Reconfirmar el mismo archivo es idempotente; otro archivo, conflicto.
 *  · Un comprobante registrado no se cambia: ni la fila (0249) ni el archivo
 *    (0258), salvo un intento nuevo tras un rechazo REAL de la cajera.
 *  · Permisos: ni `anon` ni `authenticated` pueden llamar a la RPC.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
const DB_CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
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
  return seed
}

const subir = (orderId: string, attempt = 1, tag?: string) =>
  uploadProofObject(CUSTOMER, orderId, attempt, tag)

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
  const { data } = await db
    .from('order_event_log')
    .select('id')
    .eq('order_id', id)
    .eq('event_type', 'order.prepay_proof_uploaded')
  return data ?? []
}

function psql(sql: string) {
  execFileSync('docker', [
    'exec',
    DB_CONTAINER,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])
}

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

describe('register_prepay_proof: una sola transacción', () => {
  it('registra comprobante, estado, rastro y evento del outbox juntos', async () => {
    const { orderId: id } = await pedido()
    const path = await subir(id)
    const { error } = await registrar(id, path)
    expect(error).toBeNull()

    const o = await leer(id)
    expect(o).toMatchObject({
      status: 'validando',
      proof_attempt: 1,
      comprobante_prepago_url: path,
      payment_proof_status: 'pending',
    })
    const ev = await eventos(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.payload).toMatchObject({ status: 'validando', attempt: 1 })
    expect(await rastro(id)).toHaveLength(1)
  })

  it('si falla la escritura del evento del outbox, el pedido NO cambia de estado (rollback)', async () => {
    const { orderId: id } = await pedido()
    const path = await subir(id)
    psql(`
      create or replace function public.tmp_fail_proof_event() returns trigger language plpgsql as
        $f$ begin raise exception 'fallo simulado del outbox'; end $f$;
      create trigger tmp_fail_proof_event before insert on public.domain_events
        for each row when (new.event_type = '${EVENT}') execute function public.tmp_fail_proof_event();
    `)
    try {
      const { error } = await registrar(id, path)
      expect(error?.message).toContain('fallo simulado del outbox')
    } finally {
      psql(`
        drop trigger if exists tmp_fail_proof_event on public.domain_events;
        drop function if exists public.tmp_fail_proof_event();
      `)
    }
    expect(await leer(id)).toMatchObject({
      status: 'awaiting_payment',
      proof_attempt: 0,
      comprobante_prepago_url: null,
    })
    expect(await eventos(id)).toHaveLength(0)
    expect(await rastro(id)).toHaveLength(0)
  })

  it('un pedido ajeno responde como inexistente y no deja rastro', async () => {
    const { orderId: id } = await pedido()
    const { error } = await registrar(id, `${OTHER_CUSTOMER}/${id}/attempt-1-x.png`, OTHER_CUSTOMER)
    expect(error?.code).toBe('P0002')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
    expect(await rastro(id)).toHaveLength(0)
  })

  it('un pedido que no espera comprobante se rechaza sin tocar nada', async () => {
    const { orderId: id } = await pedido('pending_acceptance')
    const { error } = await registrar(id, await subir(id))
    expect(error?.hint).toBe('order_not_awaiting_proof')
    expect((await leer(id))?.status).toBe('pending_acceptance')
    expect(await eventos(id)).toHaveLength(0)
    expect(await rastro(id)).toHaveLength(0)
  })

  it('con dos intentos gastados no hay un tercero', async () => {
    const { orderId: id } = await pedido('awaiting_payment', 2)
    const { error } = await registrar(id, await subir(id, 3))
    expect(error?.hint).toBe('proof_attempts_exhausted')
    expect((await leer(id))?.proof_attempt).toBe(2)
    expect(await eventos(id)).toHaveLength(0)
  })

  it('dos archivos distintos a la vez: gana uno y queda un solo evento', async () => {
    const { orderId: id } = await pedido()
    const [pa, pb] = [await subir(id, 1, 'a'), await subir(id, 1, 'b')]
    const [a, b] = await Promise.all([registrar(id, pa), registrar(id, pb)])
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1)
    expect((await leer(id))?.proof_attempt).toBe(1)
    expect(await eventos(id)).toHaveLength(1)
    expect(await rastro(id)).toHaveLength(1)
  })
})

describe('la ruta es de este pedido, de este intento, y el archivo existe', () => {
  it('un archivo que no existe en Storage se rechaza', async () => {
    const { orderId: id } = await pedido()
    const { error } = await registrar(id, `${CUSTOMER}/${id}/attempt-1-fantasma.png`)
    expect(error?.hint).toBe('proof_file_missing')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })

  it('el archivo de OTRO pedido del mismo cliente se rechaza', async () => {
    const { orderId: id } = await pedido()
    const { orderId: otro } = await pedido()
    const ajeno = await subir(otro)
    const { error } = await registrar(id, ajeno)
    expect(error?.hint).toBe('invalid_proof_path')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })

  it('el archivo de OTRO intento se rechaza', async () => {
    const { orderId: id } = await pedido()
    const delSegundo = await subir(id, 2)
    const { error } = await registrar(id, delSegundo)
    expect(error?.hint).toBe('invalid_proof_path')
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })

  it('una ruta fuera de la carpeta del cliente se rechaza', async () => {
    const { orderId: id } = await pedido()
    const { error } = await registrar(id, `${OTHER_CUSTOMER}/${id}/attempt-1-x.png`)
    expect(error?.hint).toBe('invalid_proof_path')
    expect(await eventos(id)).toHaveLength(0)
  })
})

describe('reconfirmar el comprobante', () => {
  it('el MISMO archivo es idempotente: éxito, sin gastar intento ni escribir otro evento', async () => {
    const { orderId: id } = await pedido()
    const path = await subir(id)
    expect((await registrar(id, path)).error).toBeNull()

    const { data, error } = await registrar(id, path)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'validando', attempt: 1, replayed: true })
    expect((await leer(id))?.proof_attempt).toBe(1)
    expect(await eventos(id)).toHaveLength(1)
    expect(await rastro(id)).toHaveLength(1)
  })

  it('OTRO archivo es un conflicto y el registrado no cambia', async () => {
    const { orderId: id } = await pedido()
    const uno = await subir(id, 1, 'uno')
    await registrar(id, uno)
    const { error } = await registrar(id, await subir(id, 1, 'dos'))
    expect(error?.hint).toBe('order_not_awaiting_proof')
    expect((await leer(id))?.comprobante_prepago_url).toBe(uno)
    expect(await eventos(id)).toHaveLength(1)
  })
})

describe('un comprobante registrado no se cambia', () => {
  it('un UPDATE directo no puede sustituirlo ni borrarlo', async () => {
    const { orderId: id } = await pedido()
    const uno = await subir(id)
    await registrar(id, uno)

    const cambiar = await db
      .from('orders')
      .update({ comprobante_prepago_url: 'otro.jpg' })
      .eq('id', id)
    expect(cambiar.error?.hint).toBe('proof_immutable')
    const borrar = await db.from('orders').update({ comprobante_prepago_url: null }).eq('id', id)
    expect(borrar.error?.hint).toBe('proof_immutable')
    expect((await leer(id))?.comprobante_prepago_url).toBe(uno)
  })

  it('tras un rechazo REAL de la cajera (validate_order), el intento 2 trae su archivo', async () => {
    const seed = await pedido()
    const id = seed.orderId
    const uno = await subir(id, 1)
    await registrar(id, uno)

    const { data: rechazo, error: errRechazo } = await db.rpc('validate_order', {
      p_order_id: id,
      p_actor_user_id: seed.userId,
      p_actor_role: 'business',
      p_pass: false,
      p_reason: 'No se ve el monto',
      p_reason_code: 'invalid_proof',
    })
    expect(errRechazo).toBeNull()
    expect(rechazo).toMatchObject({ status: 'awaiting_payment', outcome: 'retry_allowed' })

    // El archivo del intento 1 ya no vale para el 2.
    const viejo = await registrar(id, uno)
    expect(viejo.error?.hint).toBe('invalid_proof_path')

    const dos = await subir(id, 2)
    const { error } = await registrar(id, dos)
    expect(error).toBeNull()
    const o = await leer(id)
    expect(o?.proof_attempt).toBe(2)
    expect(o?.comprobante_prepago_url).toBe(dos)
    expect(await eventos(id)).toHaveLength(2)
  })
})

describe('el archivo registrado tampoco se sobrescribe (0258)', () => {
  let customerClient: ReturnType<typeof createClient>

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

  it('el cliente sube un archivo nuevo, pero no puede reemplazar uno ya subido', async () => {
    const { orderId: id } = await pedido()
    const path = `${CUSTOMER}/${id}/attempt-1-propio.png`
    const original = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const nuevo = await customerClient.storage
      .from('payment-proofs')
      .upload(path, original, { contentType: 'image/png' })
    expect(nuevo.error).toBeNull() // la subida normal sigue funcionando

    const otro = new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/png' })
    const pisar = await customerClient.storage
      .from('payment-proofs')
      .upload(path, otro, { contentType: 'image/png', upsert: true })
    expect(pisar.error).not.toBeNull()

    const { data } = await db.storage.from('payment-proofs').download(path)
    expect((await data?.arrayBuffer())?.byteLength).toBe(3) // sigue siendo el original
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
    const { orderId: id } = await pedido()
    const { error } = await cliente().rpc('register_prepay_proof', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
      p_path: await subir(id),
    })
    expect(error).not.toBeNull()
    expect((await leer(id))?.status).toBe('awaiting_payment')
    expect(await eventos(id)).toHaveLength(0)
  })
})
