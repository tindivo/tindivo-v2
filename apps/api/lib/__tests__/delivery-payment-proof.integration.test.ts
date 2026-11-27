/**
 * Pago único del cliente de confianza (0296): `delivery_payment_proof_next_attempt`,
 * `register_delivery_payment_proof`, `confirm_delivery_payment` y
 * `reject_delivery_payment_proof`.
 *
 * QUÉ AMARRA
 *  · Un `pending_yape` ya aceptado registra su captura y el `status` NO cambia.
 *  · Dos intentos como máximo; el tercero se niega (`proof_attempts_exhausted`).
 *  · Confirmar es solo del dueño del negocio, vale con o sin captura y es idempotente:
 *    la segunda llamada devuelve lo mismo y no escribe un segundo evento.
 *  · Rechazar deja `rejected`: no cancela, no pone strike y no deshace un ingreso confirmado.
 *  · Ninguna escribe sobre un pedido entregado o cancelado (`order_closed`).
 *  · Nada de esto escribe en `business_charges`.
 *  · El prepago sigue por su camino: sus RPC no atienden a un `pending_yape` ni al revés.
 *  · Permisos: ni `anon` ni `authenticated` pueden llamar a las RPC.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanup,
  localClient as db,
  removeProofObjects,
  type SeededOrder,
  seedPrepaidOrder,
  setOrderStatus,
  uploadProofObject,
} from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const DB_CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000000003'
const OTHER_CUSTOMER = 'e2e00000-0000-4000-8000-000000000004'
const OTHER_USER = 'e2e00000-0000-4000-8000-000000000002'

const sembrados: SeededOrder[] = []

type Estado = 'confirmed' | 'preparing' | 'waiting_driver' | 'picked_up'

/** Un pedido con entrega de pago único, ya aceptado por el negocio (por defecto `preparing`). */
async function pedido(estado: Estado | 'pending_acceptance' = 'preparing') {
  const seed = await seedPrepaidOrder({
    paymentIntent: 'pending_yape',
    status: 'pending_acceptance',
  })
  sembrados.push(seed)
  await db.from('orders').update({ customer_user_id: CUSTOMER }).eq('id', seed.orderId)
  if (estado !== 'pending_acceptance') {
    // `confirmed` es el primer estado aceptado; el resto es una escalera de un solo escalón.
    await setOrderStatus(seed.orderId, 'confirmed')
    if (estado !== 'confirmed') await setOrderStatus(seed.orderId, estado)
  }
  return seed
}

const subir = (orderId: string, attempt = 1, user = CUSTOMER) =>
  uploadProofObject(user, orderId, attempt)

const registrar = (id: string, path: string, user = CUSTOMER) =>
  db.rpc('register_delivery_payment_proof', {
    p_order_id: id,
    p_customer_user_id: user,
    p_path: path,
  })

const confirmar = (id: string, actor: string) =>
  db.rpc('confirm_delivery_payment', { p_order_id: id, p_actor_user_id: actor })

const rechazar = (id: string, actor: string, attempt: number, reason = 'invalid_proof') =>
  db.rpc('reject_delivery_payment_proof', {
    p_order_id: id,
    p_actor_user_id: actor,
    p_attempt: attempt,
    p_reason_code: reason,
  })

async function leer(id: string) {
  const { data } = await db
    .from('orders')
    .select(
      'status,proof_attempt,comprobante_prepago_url,payment_proof_status,payment_verified_at,payment_verified_by,validation_context',
    )
    .eq('id', id)
    .single()
  return data
}

async function eventos(id: string, tipo: string) {
  const { data } = await db
    .from('domain_events')
    .select('event_type,payload')
    .eq('aggregate_id', id)
    .eq('event_type', tipo)
  return data ?? []
}

async function rastro(id: string, tipo: string) {
  const { data } = await db
    .from('order_event_log')
    .select('id')
    .eq('order_id', id)
    .eq('event_type', tipo)
  return data ?? []
}

async function cargos(id: string) {
  const { data } = await db.from('business_charges').select('id').eq('order_id', id)
  return data ?? []
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

describe('register_delivery_payment_proof', () => {
  it('registra la captura de un pending_yape en preparación y el status NO cambia', async () => {
    const { orderId: id } = await pedido('preparing')
    const path = await subir(id)
    const { data, error } = await registrar(id, path)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'preparing', attempt: 1, paymentProofStatus: 'pending' })

    const o = await leer(id)
    expect(o).toMatchObject({
      status: 'preparing',
      proof_attempt: 1,
      comprobante_prepago_url: path,
      payment_proof_status: 'pending',
      payment_verified_at: null,
    })
    expect(await eventos(id, 'OrderPaymentProofUploaded')).toHaveLength(1)
    expect(await rastro(id, 'order.delivery_payment_proof_uploaded')).toHaveLength(1)
    expect(await cargos(id)).toHaveLength(0)
  })

  it('reconfirmar el mismo archivo es idempotente: no gasta intento ni repite el evento', async () => {
    const { orderId: id } = await pedido('confirmed')
    const path = await subir(id)
    await registrar(id, path)
    const { data, error } = await registrar(id, path)
    expect(error).toBeNull()
    expect(data).toMatchObject({ replayed: true, attempt: 1 })
    expect((await leer(id))?.proof_attempt).toBe(1)
    expect(await eventos(id, 'OrderPaymentProofUploaded')).toHaveLength(1)
  })

  it('permite un segundo intento y niega el tercero (proof_attempts_exhausted)', async () => {
    const { orderId: id } = await pedido('preparing')
    expect((await registrar(id, await subir(id, 1))).error).toBeNull()
    expect((await registrar(id, await subir(id, 2))).error).toBeNull()
    expect((await leer(id))?.proof_attempt).toBe(2)

    const tercera = await registrar(id, await subir(id, 3))
    expect(tercera.error?.code).toBe('P0001')
    expect(tercera.error?.hint).toBe('proof_attempts_exhausted')
    const sonda = await db.rpc('delivery_payment_proof_next_attempt', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
    })
    expect(sonda.error?.hint).toBe('proof_attempts_exhausted')
    expect((await leer(id))?.proof_attempt).toBe(2)
  })

  it('next_attempt dice el intento sin escribir nada', async () => {
    const { orderId: id } = await pedido('preparing')
    const { data, error } = await db.rpc('delivery_payment_proof_next_attempt', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
    })
    expect(error).toBeNull()
    expect(data).toBe(1)
    expect((await leer(id))?.proof_attempt).toBe(0)
  })

  it('un cliente ajeno recibe P0002, como un pedido que no existe', async () => {
    const { orderId: id } = await pedido('preparing')
    const path = await subir(id, 1, OTHER_CUSTOMER)
    try {
      const { error } = await registrar(id, path, OTHER_CUSTOMER)
      expect(error?.code).toBe('P0002')
    } finally {
      await removeProofObjects(OTHER_CUSTOMER, id)
    }
  })

  it('rechaza una ruta de otro intento, de otro pedido o un archivo que no existe', async () => {
    const { orderId: id } = await pedido('preparing')
    const delOtroIntento = await registrar(id, await subir(id, 2))
    expect(delOtroIntento.error?.hint).toBe('invalid_proof_path')

    const inexistente = await registrar(id, `${CUSTOMER}/${id}/attempt-1-no-existe.png`)
    expect(inexistente.error?.hint).toBe('proof_file_missing')
    expect((await leer(id))?.proof_attempt).toBe(0)
    expect(await eventos(id, 'OrderPaymentProofUploaded')).toHaveLength(0)
  })

  it('no atiende a un pedido que el negocio todavía no aceptó (order_not_accepted)', async () => {
    const { orderId: id } = await pedido('pending_acceptance')
    const { error } = await registrar(id, await subir(id))
    expect(error?.hint).toBe('order_not_accepted')
  })

  it('sobre un pedido entregado o cancelado falla con order_closed y no escribe', async () => {
    const { orderId: id } = await pedido('preparing')
    await setOrderStatus(id, 'cancelled')
    const { error } = await registrar(id, await subir(id))
    expect(error?.hint).toBe('order_closed')
    expect(await eventos(id, 'OrderPaymentProofUploaded')).toHaveLength(0)
  })

  it('con el ingreso ya confirmado no admite otra captura (payment_already_confirmed)', async () => {
    const seed = await pedido('preparing')
    await confirmar(seed.orderId, seed.userId)
    const { error } = await registrar(seed.orderId, await subir(seed.orderId))
    expect(error?.hint).toBe('payment_already_confirmed')
  })

  it('un prepago no pasa por aquí y un pending_yape no pasa por register_prepay_proof', async () => {
    const prepago = await seedPrepaidOrder({
      status: 'awaiting_payment',
      validationContext: 'proof',
    })
    sembrados.push(prepago)
    await db.from('orders').update({ customer_user_id: CUSTOMER }).eq('id', prepago.orderId)
    const aqui = await registrar(prepago.orderId, await subir(prepago.orderId))
    expect(aqui.error?.hint).toBe('order_not_pending_yape')

    const { orderId: id } = await pedido('preparing')
    const alla = await db.rpc('register_prepay_proof', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
      p_path: await subir(id),
    })
    expect(alla.error?.hint).toBe('order_not_awaiting_proof')
  })
})

describe('confirm_delivery_payment', () => {
  it('sin captura: sella verified, no cambia el status, no escribe cargos', async () => {
    const seed = await pedido('preparing')
    const { data, error } = await confirmar(seed.orderId, seed.userId)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'preparing', paymentProofStatus: 'verified' })

    const o = await leer(seed.orderId)
    expect(o).toMatchObject({ status: 'preparing', payment_proof_status: 'verified' })
    expect(o?.payment_verified_at).not.toBeNull()
    expect(o?.payment_verified_by).toBe(seed.userId)
    expect(await cargos(seed.orderId)).toHaveLength(0)
  })

  it('con captura pendiente la deja verified', async () => {
    const seed = await pedido('waiting_driver')
    await registrar(seed.orderId, await subir(seed.orderId))
    const { error } = await confirmar(seed.orderId, seed.userId)
    expect(error).toBeNull()
    expect((await leer(seed.orderId))?.payment_proof_status).toBe('verified')
  })

  it('dos veces: mismo resultado y una sola fila en domain_events y en el rastro', async () => {
    const seed = await pedido('preparing')
    const primera = await confirmar(seed.orderId, seed.userId)
    const segunda = await confirmar(seed.orderId, seed.userId)
    expect(primera.error).toBeNull()
    expect(segunda.error).toBeNull()
    expect(segunda.data).toMatchObject({
      paymentProofStatus: 'verified',
      replayed: true,
    })
    expect((segunda.data as { paymentVerifiedAt: string }).paymentVerifiedAt).toBe(
      (primera.data as { paymentVerifiedAt: string }).paymentVerifiedAt,
    )
    expect(await eventos(seed.orderId, 'OrderPaymentConfirmed')).toHaveLength(1)
    expect(await rastro(seed.orderId, 'order.delivery_payment_confirmed')).toHaveLength(1)
  })

  it('solo el dueño del negocio del pedido: otro usuario recibe P0002', async () => {
    const seed = await pedido('preparing')
    for (const intruso of [OTHER_USER, CUSTOMER]) {
      const { error } = await confirmar(seed.orderId, intruso)
      expect(error?.code).toBe('P0002')
    }
    expect((await leer(seed.orderId))?.payment_verified_at).toBeNull()
  })

  it('sobre un pedido entregado falla con order_closed y no lo toca', async () => {
    const seed = await pedido('preparing')
    await db.from('orders').update({ status: 'cancelled' }).eq('id', seed.orderId)
    const { error } = await confirmar(seed.orderId, seed.userId)
    expect(error?.hint).toBe('order_closed')
    expect((await leer(seed.orderId))?.payment_verified_at).toBeNull()
    expect(await eventos(seed.orderId, 'OrderPaymentConfirmed')).toHaveLength(0)
  })

  it('un prepago no se confirma por aquí (order_not_pending_yape)', async () => {
    const seed = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
    sembrados.push(seed)
    const { error } = await confirmar(seed.orderId, seed.userId)
    expect(error?.hint).toBe('order_not_pending_yape')
  })
})

describe('reject_delivery_payment_proof', () => {
  it('deja rejected sin cancelar, sin strike y sin cargos; el cliente puede reintentar', async () => {
    const seed = await pedido('preparing')
    const antes = await db.from('customer_strikes').select('id', { count: 'exact', head: true })
    await registrar(seed.orderId, await subir(seed.orderId, 1))

    const { data, error } = await rechazar(seed.orderId, seed.userId, 1, 'wrong_amount')
    expect(error).toBeNull()
    expect(data).toMatchObject({ paymentProofStatus: 'rejected', attempt: 1, attemptsLeft: 1 })

    const o = await leer(seed.orderId)
    expect(o).toMatchObject({ status: 'preparing', payment_proof_status: 'rejected' })
    expect(o?.payment_verified_at).toBeNull()
    const despues = await db.from('customer_strikes').select('id', { count: 'exact', head: true })
    expect(despues.count).toBe(antes.count)
    expect(await cargos(seed.orderId)).toHaveLength(0)
    expect(await eventos(seed.orderId, 'OrderPaymentProofRejected')).toHaveLength(1)

    // Segundo intento permitido y vuelve a `pending`.
    const reintento = await registrar(seed.orderId, await subir(seed.orderId, 2))
    expect(reintento.error).toBeNull()
    expect((await leer(seed.orderId))?.payment_proof_status).toBe('pending')
  })

  it('rechazar el mismo intento dos veces es idempotente', async () => {
    const seed = await pedido('preparing')
    await registrar(seed.orderId, await subir(seed.orderId, 1))
    await rechazar(seed.orderId, seed.userId, 1)
    const { data, error } = await rechazar(seed.orderId, seed.userId, 1)
    expect(error).toBeNull()
    expect(data).toMatchObject({ replayed: true })
    expect(await eventos(seed.orderId, 'OrderPaymentProofRejected')).toHaveLength(1)
  })

  it('no rechaza otro intento que el vigente ni donde no hay captura', async () => {
    const seed = await pedido('preparing')
    const sinCaptura = await rechazar(seed.orderId, seed.userId, 1)
    expect(sinCaptura.error?.hint).toBe('no_proof_to_reject')

    await registrar(seed.orderId, await subir(seed.orderId, 1))
    const otro = await rechazar(seed.orderId, seed.userId, 2)
    expect(otro.error?.hint).toBe('proof_attempt_mismatch')
    const motivo = await rechazar(seed.orderId, seed.userId, 1, 'porque_si')
    expect(motivo.error?.hint).toBe('invalid_reason_code')
    expect((await leer(seed.orderId))?.payment_proof_status).toBe('pending')
  })

  it('no deshace un ingreso ya confirmado', async () => {
    const seed = await pedido('preparing')
    await registrar(seed.orderId, await subir(seed.orderId, 1))
    await confirmar(seed.orderId, seed.userId)
    const { error } = await rechazar(seed.orderId, seed.userId, 1)
    expect(error?.hint).toBe('payment_already_confirmed')
    expect((await leer(seed.orderId))?.payment_proof_status).toBe('verified')
  })

  it('solo el dueño del negocio rechaza', async () => {
    const seed = await pedido('preparing')
    await registrar(seed.orderId, await subir(seed.orderId, 1))
    const { error } = await rechazar(seed.orderId, OTHER_USER, 1)
    expect(error?.code).toBe('P0002')
  })
})

describe('permisos de las RPC del pago único', () => {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY)
  const id = '00000000-0000-4000-8000-000000000001'

  it('anon no puede ejecutar ninguna', async () => {
    const llamadas = [
      anon.rpc('delivery_payment_proof_next_attempt', { p_order_id: id, p_customer_user_id: id }),
      anon.rpc('register_delivery_payment_proof', {
        p_order_id: id,
        p_customer_user_id: id,
        p_path: 'x',
      }),
      anon.rpc('confirm_delivery_payment', { p_order_id: id, p_actor_user_id: id }),
      anon.rpc('reject_delivery_payment_proof', {
        p_order_id: id,
        p_actor_user_id: id,
        p_attempt: 1,
        p_reason_code: 'other',
      }),
    ]
    for (const r of await Promise.all(llamadas)) {
      expect(r.error?.code).toBe('42501')
    }
  })

  it('el catálogo: ni anon, ni authenticated, ni PUBLIC; solo service_role', () => {
    const firmas = [
      'public.delivery_payment_proof_next_attempt(uuid, uuid)',
      'public.register_delivery_payment_proof(uuid, uuid, text)',
      'public.confirm_delivery_payment(uuid, uuid)',
      'public.reject_delivery_payment_proof(uuid, uuid, int, text)',
    ]
    const permiso = (rol: string, firma: string) =>
      execFileSync(
        'docker',
        [
          'exec',
          DB_CONTAINER,
          'psql',
          '-U',
          'postgres',
          '-tAc',
          `select has_function_privilege('${rol}', '${firma}'::regprocedure, 'execute')`,
        ],
        { encoding: 'utf8' },
      ).trim()
    for (const firma of firmas) {
      expect({ firma, anon: permiso('anon', firma) }).toEqual({ firma, anon: 'f' })
      expect({ firma, authenticated: permiso('authenticated', firma) }).toEqual({
        firma,
        authenticated: 'f',
      })
      expect({ firma, service: permiso('service_role', firma) }).toEqual({ firma, service: 't' })
    }
    // PUBLIC: ninguna ACL con el grantee vacío.
    const acl = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-tAc',
        `select count(*) from pg_proc where proname in ('delivery_payment_proof_next_attempt','register_delivery_payment_proof','confirm_delivery_payment','reject_delivery_payment_proof') and (proacl is null or proacl::text like '%,=X%' or proacl::text like '{=X%')`,
      ],
      { encoding: 'utf8' },
    ).trim()
    expect(acl).toBe('0')
  })
})
