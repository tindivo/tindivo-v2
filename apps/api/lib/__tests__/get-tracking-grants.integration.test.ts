/**
 * Migración 0260: `get_tracking` ya no se llama directo en PostgREST (SEC-03).
 * El seguimiento público pasa solo por la API (`GET /public/orders/{shortId}`),
 * que sí tiene límite de tasa por IP.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= SERVICE_KEY

import { GET as getTracking } from '../../app/api/v1/public/orders/[shortId]/route'

const opts = { auth: { persistSession: false, autoRefreshToken: false } }

describe('0260 · get_tracking solo por la API', () => {
  let world: LedgerWorld
  let shortId = ''

  beforeAll(async () => {
    world = await seedLedgerWorld()
    const orderId = await seedOrder(world)
    const { data, error } = await service
      .from('orders')
      .select('short_id')
      .eq('id', orderId)
      .single()
    if (error) throw new Error(error.message)
    shortId = data.short_id
  })

  afterAll(async () => {
    if (world) await cleanupLedgerWorld(world)
  })

  it('anon recibe permission denied llamándola directo en PostgREST', async () => {
    const { data, error } = await createClient(URL, ANON_KEY, opts).rpc('get_tracking', {
      p_short_id: shortId,
    })
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('authenticated tampoco', async () => {
    const c = createClient(URL, ANON_KEY, opts)
    const { error: loginErr } = await c.auth.signInWithPassword({
      email: 'admin@e2e.local',
      password: 'e2e-password-12345',
    })
    expect(loginErr).toBeNull()
    const { error } = await c.rpc('get_tracking', { p_short_id: shortId })
    expect(error?.code).toBe('42501')
  })

  it('service_role sí (es lo que usa la API)', async () => {
    const { data, error } = await service.rpc('get_tracking', { p_short_id: shortId })
    expect(error).toBeNull()
    expect((data as { shortId?: string } | null)?.shortId).toBe(shortId)
  })

  it('el seguimiento sigue funcionando por la API, sin sesión', async () => {
    const res = await getTracking(
      new Request(`http://localhost:3001/api/v1/public/orders/${shortId}`),
      {
        params: Promise.resolve({ shortId }),
      },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { shortId?: string }
    expect(body.shortId).toBe(shortId)
  })

  it('un short_id inexistente sigue dando 404 por la API (no un 500 por permisos)', async () => {
    const res = await getTracking(
      new Request('http://localhost:3001/api/v1/public/orders/ZZZZZZZZ'),
      {
        params: Promise.resolve({ shortId: 'ZZZZZZZZ' }),
      },
    )
    expect(res.status).toBe(404)
  })
})
