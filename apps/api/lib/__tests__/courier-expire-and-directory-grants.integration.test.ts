/**
 * Permisos cerrados por la 0255: `expire_courier_orders()` y los teléfonos de
 * `directory_businesses`.
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { localClient as service } from './helpers/local-db'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

async function authenticated() {
  const c = createClient(URL, ANON_KEY, opts)
  const { error } = await c.auth.signInWithPassword({
    email: 'admin@e2e.local',
    password: 'e2e-password-12345',
  })
  if (error) throw new Error(`login falló: ${error.message}`)
  return c
}

describe('0255 · expire_courier_orders', () => {
  it('anon no puede ejecutarla', async () => {
    const { error } = await createClient(URL, ANON_KEY, opts).rpc('expire_courier_orders')
    expect(error?.code).toBe('42501')
  })

  it('authenticated (ni siquiera admin) no puede ejecutarla', async () => {
    const { error } = await (await authenticated()).rpc('expire_courier_orders')
    expect(error?.code).toBe('42501')
  })

  it('service_role sí', async () => {
    const { data, error } = await service.rpc('expire_courier_orders')
    expect(error).toBeNull()
    expect(typeof data).toBe('number')
  })
})

describe('0255 · directory_businesses', () => {
  it('anon no lee phone ni whatsapp', async () => {
    const anon = createClient(URL, ANON_KEY, opts)
    for (const col of ['phone', 'whatsapp', '*']) {
      const { error } = await anon.from('directory_businesses').select(col).limit(1)
      expect(error?.code, col).toBe('42501')
    }
  })

  it('authenticated no lee phone', async () => {
    const { error } = await (await authenticated())
      .from('directory_businesses')
      .select('phone')
      .limit(1)
    expect(error?.code).toBe('42501')
  })

  it('anon sí lee las demás columnas', async () => {
    const { error } = await createClient(URL, ANON_KEY, opts)
      .from('directory_businesses')
      .select('id,name,category,lat,lng,reference_text,visible_on_map')
      .limit(1)
    expect(error).toBeNull()
  })

  it('service_role sí lee phone', async () => {
    const { error } = await service.from('directory_businesses').select('phone,whatsapp').limit(1)
    expect(error).toBeNull()
  })
})
