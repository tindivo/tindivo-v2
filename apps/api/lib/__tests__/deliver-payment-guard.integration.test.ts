/**
 * La entrega respeta el pago único que el negocio ya confirmó (0297, RIESGO-001).
 *
 * QUÉ AMARRA
 *  · Con `payment_intent = 'pending_yape'` y `payment_verified_at` puesto, `advance_order('deliver')`
 *    solo registra `paid_yape` (explícito o por omisión). Cualquier otro método se niega con
 *    `payment_already_confirmed` y no escribe nada: el cliente no paga dos veces.
 *  · Sin confirmación del negocio nada cambia: manda lo que declara el motorizado y el servidor
 *    nunca infiere `paid_yape` por una captura pendiente ni por el `payment_intent`.
 *  · La carrera con `confirm_delivery_payment` la serializa el `FOR UPDATE` de la fila del pedido:
 *    gana quien entra primero y el otro ve el estado ya cambiado.
 *  · El reenvío de una cola sin conexión no cambia el cobro ya registrado.
 *  · Sin regresión para prepago ni contraentrega; la función sigue sin sobrecarga y sin permisos
 *    para `anon` ni `authenticated`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { setTimeout as espera } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { handleOrderTransition } from '../http/order-transition'
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

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const DB_CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000000003'
// El seeder crea 50 de pedido + 3 de envío.
const TOTAL = 53

// El handler HTTP construye su propio cliente desde el entorno (igual que deliver-transition-http).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

type Respuesta = { data: unknown; error: { code?: string; hint?: string; message?: string } | null }

const sembrados: SeededOrder[] = []
let accessToken = ''

/** Un pedido de pago único (`pending_yape`) ya recogido por el motorizado del mundo e2e. */
async function pedido(opts: { confirmado?: boolean; intent?: string } = {}) {
  const seed = await seedPrepaidOrder({
    paymentIntent: (opts.intent ?? 'pending_yape') as 'pending_yape',
    status: 'pending_acceptance',
  })
  sembrados.push(seed)
  await db.from('orders').update({ customer_user_id: CUSTOMER }).eq('id', seed.orderId)
  await setOrderStatus(seed.orderId, 'confirmed')
  await setOrderStatus(seed.orderId, 'preparing')
  await db.from('orders').update({ driver_id: E2E.DRIVER_ID }).eq('id', seed.orderId)
  await setOrderStatus(seed.orderId, 'picked_up')
  if (opts.confirmado) {
    const { error } = await confirmar(seed.orderId, seed.userId)
    if (error) throw new Error(`no se pudo confirmar el pago del pedido: ${error.message}`)
  }
  return seed
}

const confirmar = (id: string, actor: string) =>
  db.rpc('confirm_delivery_payment', { p_order_id: id, p_actor_user_id: actor })

const entregar = (id: string, params: Record<string, unknown> = {}) =>
  db.rpc('advance_order', {
    p_order_id: id,
    p_actor_user_id: E2E.DRIVER_USER_ID,
    p_actor_role: 'driver',
    p_action: 'deliver',
    p_params: params,
  })

async function leer(id: string) {
  const { data } = await db
    .from('orders')
    .select(
      'status,payment_real,cash_owed_at_delivery,cash_amount,yape_amount,payment_verified_at,payment_proof_status',
    )
    .eq('id', id)
    .single()
  return data
}

async function cargos(id: string) {
  const { data } = await db.from('business_charges').select('id').eq('order_id', id)
  return data ?? []
}

/** El rechazo de la guardia: P0001 con la pista que lee la app. */
function esRechazoDeGuardia(r: Respuesta) {
  expect(r.error?.code).toBe('P0001')
  expect(r.error?.hint).toBe('payment_already_confirmed')
}

/** Nada se escribió: el pedido sigue recogido y sin cobro. */
async function sigueSinCobrar(id: string) {
  const o = await leer(id)
  expect(o?.status).toBe('picked_up')
  expect(o?.payment_real).toBeNull()
  expect(o?.cash_owed_at_delivery).toBeNull()
  expect(await cargos(id)).toHaveLength(0)
}

/**
 * Abre otra sesión `psql` que corre `sql` dentro de una transacción con `pg_sleep` (así la fila queda
 * retenida), espera a que esté dormida y devuelve la promesa de su cierre. Mismo patrón que
 * `conFilaRetenida` de delivery-payment-proof.
 */
async function sesionRetenida(id: string, sql: string) {
  const app = `guardia-${id}`
  const proc = spawn(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  )
  let stderr = ''
  proc.stderr.on('data', (d) => {
    stderr += String(d)
  })
  const terminado = new Promise<void>((resolve, reject) => {
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`la sesión retenida terminó con ${code}: ${stderr}`)),
    )
  })
  proc.stdin.end(`SET application_name = '${app}'; BEGIN; ${sql} SELECT pg_sleep(2); COMMIT;\n`)

  let reteniendo = false
  for (let i = 0; i < 200 && !reteniendo; i++) {
    const n = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-tAc',
        `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`,
      ],
      { encoding: 'utf8' },
    ).trim()
    reteniendo = n === '1'
    if (!reteniendo) await espera(50)
  }
  expect(reteniendo, 'la sesión nunca llegó a retener la fila').toBe(true)
  return { terminado }
}

/** Corre `llamada` y devuelve su respuesta con lo que tardó. */
async function medida(llamada: () => PromiseLike<Respuesta>) {
  const t0 = Date.now()
  const r = await llamada()
  return { r, ms: Date.now() - t0 }
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

beforeAll(async () => {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({
    email: 'motorizado@e2e.local',
    password: 'e2e-password-12345',
  })
  if (error || !data.session) {
    throw new Error(
      `No se pudo autenticar el motorizado e2e: ${error?.message}. Corre \`pnpm db:seed:e2e\`.`,
    )
  }
  accessToken = data.session.access_token
})

describe('deliver con el pago único ya confirmado por el negocio', () => {
  it('A. paid_cash se niega con payment_already_confirmed y no escribe nada', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const r = await entregar(id, { paymentReal: 'paid_cash' })
    esRechazoDeGuardia(r)
    await sigueSinCobrar(id)
    expect((await leer(id))?.payment_verified_at).not.toBeNull()
  })

  it('B. paid_mixed (con partes que suman) se niega igual', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const r = await entregar(id, { paymentReal: 'paid_mixed', cashAmount: 20, yapeAmount: 33 })
    esRechazoDeGuardia(r)
    await sigueSinCobrar(id)
  })

  it('B2. paid_prepaid tampoco pasa: el método no es del motorizado', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const r = await entregar(id, { paymentReal: 'paid_prepaid' })
    esRechazoDeGuardia(r)
    await sigueSinCobrar(id)
  })

  it('C. paid_yape explícito se acepta: entregado, sin efectivo que rendir', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const r = await entregar(id, { paymentReal: 'paid_yape' })
    expect(r.error).toBeNull()
    const o = await leer(id)
    expect(o?.status).toBe('delivered')
    expect(o?.payment_real).toBe('paid_yape')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
  })

  it('D. sin paymentReal se registra paid_yape, no paid_cash', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const r = await entregar(id)
    expect(r.error).toBeNull()
    const o = await leer(id)
    expect(o?.status).toBe('delivered')
    expect(o?.payment_real).toBe('paid_yape')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
  })

  it('I. el reenvío de la cola sin conexión con paid_cash falla y el cobro no cambia', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    expect((await entregar(id, { paymentReal: 'paid_yape' })).error).toBeNull()
    const antes = await leer(id)

    const reenvio = await entregar(id, { paymentReal: 'paid_cash' })
    expect(reenvio.error).not.toBeNull()
    const despues = await leer(id)
    expect(despues?.payment_real).toBe('paid_yape')
    expect(despues).toEqual(antes)
  })
})

describe('deliver sin confirmación del negocio: nada cambia', () => {
  it('E. con captura pendiente y sin paymentReal cae en paid_cash (nunca infiere paid_yape)', async () => {
    const { orderId: id, userId } = await pedido()
    const path = await uploadProofObject(CUSTOMER, id, 1)
    const reg = await db.rpc('register_delivery_payment_proof', {
      p_order_id: id,
      p_customer_user_id: CUSTOMER,
      p_path: path,
    })
    expect(reg.error).toBeNull()
    const antes = await leer(id)
    expect(antes?.payment_proof_status).toBe('pending')
    expect(antes?.payment_verified_at).toBeNull()
    expect(userId).toBeTruthy()

    const r = await entregar(id)
    expect(r.error).toBeNull()
    const o = await leer(id)
    expect(o?.payment_real).toBe('paid_cash')
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL)
  })

  it('F. paid_cash se acepta y paid_yape explícito también', async () => {
    const a = await pedido()
    expect((await entregar(a.orderId, { paymentReal: 'paid_cash' })).error).toBeNull()
    const oa = await leer(a.orderId)
    expect(oa?.payment_real).toBe('paid_cash')
    expect(Number(oa?.cash_owed_at_delivery)).toBe(TOTAL)

    const b = await pedido()
    expect((await entregar(b.orderId, { paymentReal: 'paid_yape' })).error).toBeNull()
    const ob = await leer(b.orderId)
    expect(ob?.payment_real).toBe('paid_yape')
    expect(Number(ob?.cash_owed_at_delivery)).toBe(0)
  })
})

describe('carreras con confirm_delivery_payment', () => {
  it('G. gana la confirmación: la entrega espera la fila y luego se niega', async () => {
    const { orderId: id, userId } = await pedido()
    const { terminado } = await sesionRetenida(
      id,
      `SELECT public.confirm_delivery_payment('${id}', '${userId}');`,
    )
    const { r, ms } = await medida(() => entregar(id, { paymentReal: 'paid_cash' }))
    await terminado
    expect(ms).toBeGreaterThanOrEqual(1500)
    esRechazoDeGuardia(r)
    const o = await leer(id)
    expect(o?.status).toBe('picked_up')
    expect(o?.payment_real).toBeNull()
    expect(o?.payment_verified_at).not.toBeNull()
    expect(await cargos(id)).toHaveLength(0)
  })

  it('H. gana la entrega: la confirmación espera la fila y luego falla con order_closed', async () => {
    const { orderId: id, userId } = await pedido()
    const { terminado } = await sesionRetenida(
      id,
      `SELECT public.advance_order('${id}', '${E2E.DRIVER_USER_ID}', 'driver', 'deliver', '{"paymentReal":"paid_cash"}');`,
    )
    const { r, ms } = await medida(() => confirmar(id, userId))
    await terminado
    expect(ms).toBeGreaterThanOrEqual(1500)
    expect(r.error?.code).toBe('P0001')
    expect(r.error?.hint).toBe('order_closed')
    const o = await leer(id)
    expect(o?.status).toBe('delivered')
    expect(o?.payment_real).toBe('paid_cash')
    expect(o?.payment_verified_at).toBeNull()
  })
})

describe('sin regresión', () => {
  it('J. un prepaid entregado con paid_cash sigue quedando paid_prepaid', async () => {
    const { orderId: id } = await pedido({ intent: 'prepaid' })
    expect((await entregar(id, { paymentReal: 'paid_cash' })).error).toBeNull()
    const o = await leer(id)
    expect(o?.payment_real).toBe('paid_prepaid')
    expect(Number(o?.cash_owed_at_delivery)).toBe(0)
  })

  it('J2. un pending_cash con paid_cash sigue igual', async () => {
    const { orderId: id } = await pedido({ intent: 'pending_cash' })
    expect((await entregar(id, { paymentReal: 'paid_cash' })).error).toBeNull()
    const o = await leer(id)
    expect(o?.payment_real).toBe('paid_cash')
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL)
  })
})

describe('catálogo', () => {
  it('K. una sola advance_order y sin permiso para anon ni authenticated', async () => {
    const out = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-tAc',
        "select count(*) || '|' || bool_or(has_function_privilege('anon', oid, 'EXECUTE')) || '|' || bool_or(has_function_privilege('authenticated', oid, 'EXECUTE')) || '|' || bool_and(has_function_privilege('service_role', oid, 'EXECUTE')) from pg_proc where proname = 'advance_order' and pronamespace = 'public'::regnamespace",
      ],
      { encoding: 'utf8' },
    ).trim()
    expect(out).toBe('1|false|false|true')
  })
})

describe('por HTTP', () => {
  const peticion = (body: Record<string, unknown>) =>
    new Request(`${LOCAL_URL}/api/v1/driver/orders/x/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'deliver', ...body }),
    })

  it('L. paid_cash sobre un pago confirmado es 409 invalid_state_transition; paid_yape es 200', async () => {
    const { orderId: id } = await pedido({ confirmado: true })
    const malo = await handleOrderTransition(peticion({ paymentReal: 'paid_cash' }), 'driver', id)
    expect(malo.status).toBe(409)
    expect(JSON.stringify(await malo.json())).toContain('invalid_state_transition')
    await sigueSinCobrar(id)

    const bueno = await handleOrderTransition(peticion({ paymentReal: 'paid_yape' }), 'driver', id)
    expect(bueno.status).toBe(200)
    expect((await leer(id))?.payment_real).toBe('paid_yape')
  })
})
