/**
 * CA-TRK-08 · CAX-003: ninguna fuente que lea la web del cliente le da el teléfono del motorizado.
 *
 * `use-tracking.ts` lee `orders` directo por PostgREST (propiedad y nota) y se suscribe a sus cambios por
 * Realtime. Aquí se demuestra, contra la base local y con los roles reales (`anon` y el cliente dueño), que:
 *  - `orders` no tiene ninguna columna con el teléfono del motorizado (Realtime solo publica columnas de `orders`);
 *  - `drivers` (donde está `phone`) no es legible por `anon` ni por el cliente;
 *  - un embebido `drivers(phone)` desde `orders` no devuelve nada;
 *  - la RPC `get_tracking` no es ejecutable por ellos (0260) y, por el servicio, ya no trae el teléfono (0292).
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import {
  cleanupLedgerWorld,
  type LedgerWorld,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient as service } from './helpers/local-db'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const CLAVE = 'tracking-phone-12345'

describe('CAX-003 · el teléfono del motorizado no llega a la web del cliente por ninguna vía', () => {
  let world: LedgerWorld
  let shortId = ''
  let orderId = ''
  let userId = ''
  let driverPhone = ''
  const email = `tracking-phone-${Date.now()}@integration.local`

  beforeAll(async () => {
    world = await seedLedgerWorld()
    orderId = await seedOrder(world)
    const { data: u, error } = await service.auth.admin.createUser({
      email,
      password: CLAVE,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = u.user.id
    const { data: drv } = await service
      .from('drivers')
      .select('phone')
      .eq('id', FIXTURES.DRIVER_ID)
      .single()
    driverPhone = (drv as { phone: string }).phone
    expect(driverPhone.length).toBeGreaterThan(5)
    const { error: upErr } = await service
      .from('orders')
      .update({
        customer_user_id: userId,
        driver_id: FIXTURES.DRIVER_ID,
        arrived_at_customer_at: new Date().toISOString(),
      })
      .eq('id', orderId)
    if (upErr) throw new Error(upErr.message)
    const { data: o } = await service.from('orders').select('short_id').eq('id', orderId).single()
    shortId = (o as { short_id: string }).short_id
  })

  afterAll(async () => {
    if (world) await cleanupLedgerWorld(world)
    if (userId) await service.auth.admin.deleteUser(userId)
  })

  async function cliente() {
    const c = createClient(URL, ANON_KEY, opts)
    const { error } = await c.auth.signInWithPassword({ email, password: CLAVE })
    if (error) throw new Error(error.message)
    return c
  }

  it('la fila de orders que lee el dueño no tiene ninguna columna de teléfono del motorizado', async () => {
    const c = await cliente()
    const { data, error } = await c.from('orders').select('*').eq('short_id', shortId).maybeSingle()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const claves = Object.keys(data as object)
    expect(claves.filter((k) => /phone|tel/i.test(k) && /driver|motor/i.test(k))).toEqual([])
    expect(JSON.stringify(data)).not.toContain(driverPhone)
  })

  it('la lectura exacta de use-tracking (id y nota) funciona para el dueño y no trae teléfono', async () => {
    const c = await cliente()
    const { data } = await c
      .from('orders')
      .select('id,customer_notes')
      .eq('short_id', shortId)
      .maybeSingle()
    expect(Object.keys(data as object).sort()).toEqual(['customer_notes', 'id'])
    expect((data as { id: string }).id).toBe(orderId)
  })

  it('anon no lee la fila del pedido', async () => {
    const { data } = await createClient(URL, ANON_KEY, opts)
      .from('orders')
      .select('id,customer_notes')
      .eq('short_id', shortId)
      .maybeSingle()
    expect(data).toBeNull()
  })

  it('ni anon ni el cliente leen drivers, donde vive el teléfono', async () => {
    const c = await cliente()
    for (const cli of [createClient(URL, ANON_KEY, opts), c]) {
      const { data } = await cli.from('drivers').select('phone').eq('id', FIXTURES.DRIVER_ID)
      expect(data ?? []).toEqual([])
    }
  })

  it('un embebido drivers(phone) desde orders no devuelve el teléfono', async () => {
    const c = await cliente()
    const { data } = await c.from('orders').select('id,drivers(phone)').eq('short_id', shortId)
    expect(JSON.stringify(data ?? [])).not.toContain(driverPhone)
  })

  it('get_tracking no es ejecutable por anon ni por el cliente, y por el servicio ya no trae el teléfono', async () => {
    const c = await cliente()
    for (const cli of [createClient(URL, ANON_KEY, opts), c]) {
      const { error } = await cli.rpc('get_tracking', { p_short_id: shortId })
      expect(error?.code).toBe('42501')
    }
    const { data } = await service.rpc('get_tracking', { p_short_id: shortId })
    expect((data as { driverPhone: string | null }).driverPhone).toBeNull()
    expect(JSON.stringify(data)).not.toContain(driverPhone)
  })
})
