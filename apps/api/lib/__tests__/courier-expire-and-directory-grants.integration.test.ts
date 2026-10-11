/**
 * Permisos cerrados por la 0255: `expire_courier_orders()` y los teléfonos de
 * `directory_businesses`.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

/** Proyección exacta de `apps/customer/features/courier/lib/directory.ts`. */
const CUSTOMER_PROJECTION =
  'id,name,category,lat,lng,reference_text,opens_at,closes_at,cover_photo_url,is_partner,partner_business_id,courier_enabled,has_menu_in_tindivo,works_with_zorritos'

const FILA = {
  name: 'Botica 0255 (fixture)',
  category: 'pharmacy',
  lat: -9.15,
  lng: -78.28,
  reference_text: 'Fixture de la prueba 0255',
  phone: '987654321',
  whatsapp: '987654321',
  visible_on_map: true,
}

describe('0255 · directory_businesses', () => {
  let fixtureId = ''
  beforeAll(async () => {
    const { data, error } = await service
      .from('directory_businesses')
      .insert(FILA)
      .select('id')
      .single()
    if (error) throw new Error(`fixture del directorio falló: ${error.message}`)
    fixtureId = data.id
  })
  afterAll(async () => {
    if (fixtureId) await service.from('directory_businesses').delete().eq('id', fixtureId)
  })

  const clientes = {
    anon: async () => createClient(URL, ANON_KEY, opts),
    authenticated,
  }

  for (const [rol, crear] of Object.entries(clientes)) {
    it(`${rol} no lee phone, whatsapp ni *`, async () => {
      const c = await crear()
      for (const col of ['phone', 'whatsapp', '*']) {
        const { error } = await c.from('directory_businesses').select(col).limit(1)
        expect(error?.code, `${rol}:${col}`).toBe('42501')
      }
    })

    it(`${rol} lee una fila visible con la proyección del customer`, async () => {
      const c = await crear()
      const { data, error } = await c
        .from('directory_businesses')
        .select(CUSTOMER_PROJECTION)
        .eq('id', fixtureId)
        .eq('visible_on_map', true)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })
  }

  it('service_role sí lee phone y whatsapp', async () => {
    const { data, error } = await service
      .from('directory_businesses')
      .select('phone,whatsapp')
      .eq('id', fixtureId)
      .single()
    expect(error).toBeNull()
    expect(data?.phone).toBe('987654321')
  })
})

// has_function_privilege / has_column_privilege y el cron `expire-courier-orders`
// (usuario postgres) no se pueden consultar por PostgREST: los verifica el bloque
// `do $check$` al final de la 0255, que aborta `db reset` si algo no cuadra.
