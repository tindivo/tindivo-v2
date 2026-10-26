/**
 * Migración 0262 (SEC-2), contra la base local:
 *
 *  · `get_courier_tracking` deja de ser ejecutable por anon/authenticated: con un
 *    `short_id` ajeno devolvía la carrera de otro (nombres, coordenadas, motorizado).
 *    El enlace público sigue por la API (service_role).
 *  · `GET /customer/courier-orders` trae `driverName` de la carrera PROPIA (con
 *    verificación de propiedad), que es lo que la web leía por esa RPC.
 *  · `create_appeal_report`: un pedido sin dueño o cancelado sin motivo no se apela,
 *    y uno ajeno da el mismo error que uno inexistente.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as getCourierHistory } from '../../app/api/v1/customer/courier-orders/route'
import { GET as getCourierPublic } from '../../app/api/v1/public/courier/[shortId]/route'
import {
  cleanupLedgerWorld,
  type LedgerWorld,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient as db } from './helpers/local-db'
import {
  type CourierDriver,
  callCreateCourierOrder,
  cleanupCourier,
  seedCourierDriver,
  setCourierEnabled,
} from './helpers/local-db-courier'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const CLAVE = 'test-password-12345'

interface Cliente {
  id: string
  token: string
  client: ReturnType<typeof createClient>
}

const creados: string[] = []

async function crearCliente(): Promise<Cliente> {
  const email = `sec2-${crypto.randomUUID().slice(0, 8)}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino SEC2' },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  creados.push(data.user.id)
  const { error: profileError } = await db.from('customer_profiles').insert({
    user_id: data.user.id,
    full_name: 'Vecino SEC2',
    phone: `+51${tel()}`,
    phone_verified_at: new Date().toISOString(),
  })
  if (profileError) throw new Error(profileError.message)
  const client = createClient(URL, ANON_KEY, opts)
  const { data: s, error: serr } = await client.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  return { id: data.user.id, token: s.session.access_token, client }
}

async function historial(token: string) {
  const res = await getCourierHistory(
    new Request('http://localhost:3001/api/v1/customer/courier-orders', {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let telSeq = 0
/** Celular único por llamada (el tope de activas es por teléfono). */
const tel = (): string =>
  `9${String(60000000 + (Date.now() % 3000000) * 10 + ++telSeq).slice(0, 8)}`

// ─────────────────────────────────────────────────────────────────────────────
describe('0262 · get_courier_tracking cerrada y driverName por la API', () => {
  let a: Cliente
  let b: Cliente
  let driverA: CourierDriver
  let driverB: CourierDriver
  let shortA = ''
  let shortB = ''

  beforeAll(async () => {
    await setCourierEnabled(true)
    a = await crearCliente()
    b = await crearCliente()
    driverA = await seedCourierDriver()
    driverB = await seedCourierDriver()
    await db.from('drivers').update({ full_name: 'Chofer Alfa SEC2' }).eq('id', driverA.driverId)
    await db.from('drivers').update({ full_name: 'Chofer Beta SEC2' }).eq('id', driverB.driverId)
    const pares: [Cliente, CourierDriver][] = [
      [a, driverA],
      [b, driverB],
    ]
    for (const [c, drv] of pares) {
      const { data, error } = await callCreateCourierOrder({
        customerUserId: c.id,
        requesterPhone: tel(),
      })
      if (error) throw new Error(error.message)
      const created = data as { id: string; shortId: string }
      const { error: uerr } = await db
        .from('courier_orders')
        .update({ status: 'accepted', driver_id: drv.driverId })
        .eq('id', created.id)
      if (uerr) throw new Error(uerr.message)
      if (c === a) shortA = created.shortId
      else shortB = created.shortId
    }
  })

  afterAll(async () => {
    await cleanupCourier({
      customerUserIds: creados,
      driverUserIds: [driverA?.userId, driverB?.userId].filter((x): x is string => !!x),
    })
  })

  it('(a) un cliente autenticado con un short_id ajeno recibe permission denied', async () => {
    const { data, error } = await a.client.rpc('get_courier_tracking', { p_short_id: shortB })
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('(a) anon también', async () => {
    const anon = createClient(URL, ANON_KEY, opts)
    const { data, error } = await anon.rpc('get_courier_tracking', { p_short_id: shortB })
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('(a) service_role sí, y el enlace público de la API sigue funcionando', async () => {
    const { data, error } = await db.rpc('get_courier_tracking', { p_short_id: shortB })
    expect(error).toBeNull()
    expect((data as { shortId?: string } | null)?.shortId).toBe(shortB)
    const res = await getCourierPublic(
      new Request(`http://localhost:3001/api/v1/public/courier/${shortB}`),
      { params: Promise.resolve({ shortId: shortB }) },
    )
    expect(res.status).toBe(200)
  })

  it('(b) el historial trae driverName de SU carrera y no el de la ajena', async () => {
    const mia = await historial(a.token)
    expect(mia.status).toBe(200)
    const items = mia.body.data.items as { shortId: string; driverName: string | null }[]
    expect(items).toHaveLength(1)
    expect(items[0]?.shortId).toBe(shortA)
    expect(items[0]?.driverName).toBe('Chofer Alfa SEC2')
    expect(JSON.stringify(mia.body)).not.toContain('Chofer Beta SEC2')

    const suya = await historial(b.token)
    const sus = suya.body.data.items as { shortId: string; driverName: string | null }[]
    expect(sus[0]?.driverName).toBe('Chofer Beta SEC2')
    expect(JSON.stringify(suya.body)).not.toContain('Chofer Alfa SEC2')
  })

  it('(b) sin motorizado asignado, driverName es null', async () => {
    const c = await crearCliente()
    const { error } = await callCreateCourierOrder({ customerUserId: c.id, requesterPhone: tel() })
    if (error) throw new Error(error.message)
    const r = await historial(c.token)
    expect(r.body.data.items[0].driverName).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0262 · create_appeal_report', () => {
  let world: LedgerWorld
  let dueno: Cliente
  let otro: Cliente

  async function pedidoCancelado(over: {
    customer_user_id: string | null
    cancel_reason: string | null
  }): Promise<string> {
    const id = await seedOrder(world)
    const { error } = await db
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        customer_phone: '+51999111222',
        ...over,
      })
      .eq('id', id)
    if (error) throw new Error(`preparar el pedido falló: ${error.message}`)
    return id
  }

  const apelar = (c: Cliente, orderId: string) =>
    c.client.rpc('create_appeal_report', { p_order_id: orderId, p_description: 'Pagué' })

  beforeAll(async () => {
    world = await seedLedgerWorld()
    dueno = await crearCliente()
    otro = await crearCliente()
  })

  afterAll(async () => {
    if (world) {
      await db.from('reports').delete().in('order_id', world.orderIds)
      await cleanupLedgerWorld(world)
    }
  })

  it('(c) un pedido con customer_user_id NULL es rechazado', async () => {
    const id = await pedidoCancelado({
      customer_user_id: null,
      cancel_reason: 'proof_rejected_final',
    })
    const { data, error } = await apelar(otro, id)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    const { count } = await db
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
    expect(count).toBe(0)
  })

  it('(c) uno ajeno da el MISMO error que uno inexistente', async () => {
    const id = await pedidoCancelado({
      customer_user_id: dueno.id,
      cancel_reason: 'proof_rejected_final',
    })
    const ajeno = await apelar(otro, id)
    const inexistente = await apelar(otro, crypto.randomUUID())
    expect(ajeno.error).not.toBeNull()
    expect(ajeno.error?.code).toBe(inexistente.error?.code)
    expect(ajeno.error?.message).toBe(inexistente.error?.message)
  })

  it('(d) un pedido cancelado con cancel_reason NULL es rechazado', async () => {
    const id = await pedidoCancelado({ customer_user_id: dueno.id, cancel_reason: null })
    const { data, error } = await apelar(dueno, id)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    const { count } = await db
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
    expect(count).toBe(0)
  })

  it('(e) la apelación legítima de un pedido propio sigue funcionando', async () => {
    const id = await pedidoCancelado({
      customer_user_id: dueno.id,
      cancel_reason: 'proof_rejected_final',
    })
    const { data, error } = await apelar(dueno, id)
    expect(error).toBeNull()
    expect(data).toMatchObject({ ok: true, alreadyExisted: false })
    const again = await apelar(dueno, id)
    expect(again.data).toMatchObject({ ok: true, alreadyExisted: true })
  })
})
