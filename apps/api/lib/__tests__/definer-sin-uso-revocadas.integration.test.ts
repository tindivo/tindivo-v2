/**
 * Migración 0261: 12 funciones SECURITY DEFINER que ningún cliente usa pierden
 * EXECUTE (anon y/o authenticated). Las que conservan `authenticated` siguen
 * funcionando con un usuario real, y service_role (la API) conserva todas.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as service } from './helpers/local-db'
import {
  type CourierCustomer,
  callCreateCourierOrder,
  cleanupCourier,
  seedCourierCustomer,
  setCourierEnabled,
} from './helpers/local-db-courier'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

type Llamada = [nombre: string, args?: Record<string, unknown>]

// Se cierran a anon y a authenticated.
const AMBOS: Llamada[] = [
  ['courier_service_status'],
  ['courier_has_available_driver'],
  ['delivery_band_for_point', { p_lat: -9.146, p_lng: -78.278 }],
  ['get_order_intake_status'],
  ['is_within_courier_schedule'],
  ['is_within_order_intake_window'],
  ['point_in_coverage_polygon', { p_lat: -9.146, p_lng: -78.278 }],
  ['current_customer_contraentrega_outcome'],
  ['queue_lead_minutes'],
]
// Se cierran solo a anon: authenticated las sigue llamando.
const SOLO_ANON: Llamada[] = [
  ['current_service_date'],
  ['effective_max_change', { p_business_id: BUSINESS_ID }],
  ['get_courier_tracking', { p_short_id: 'ZZZZZZZZ' }],
]

const anonClient = () => createClient(URL, ANON_KEY, opts)

describe('0261 · funciones definer sin uso, cerradas', () => {
  let customer: CourierCustomer
  let user: ReturnType<typeof anonClient>
  let shortId = ''

  beforeAll(async () => {
    await setCourierEnabled(true)
    customer = await seedCourierCustomer()
    const { data: u, error: uErr } = await service.auth.admin.getUserById(customer.userId)
    if (uErr || !u.user?.email) throw new Error(`no hay email del cliente: ${uErr?.message}`)
    user = anonClient()
    const { error } = await user.auth.signInWithPassword({
      email: u.user.email,
      password: 'test-password-12345',
    })
    if (error) throw new Error(`login del cliente falló: ${error.message}`)

    const { data: created, error: cErr } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    if (cErr) throw new Error(cErr.message)
    shortId = (created as { shortId: string }).shortId
  })

  afterAll(async () => {
    if (customer) await cleanupCourier({ customerUserIds: [customer.userId] })
  })

  for (const [nombre, args] of [...AMBOS, ...SOLO_ANON]) {
    it(`anon recibe permission denied en ${nombre}`, async () => {
      const { error } = await anonClient().rpc(nombre as never, args as never)
      expect(error?.code).toBe('42501')
      expect(error?.message).toMatch(/permission denied/i)
    })
  }

  for (const [nombre, args] of AMBOS) {
    it(`authenticated recibe permission denied en ${nombre}`, async () => {
      const { error } = await user.rpc(nombre as never, args as never)
      expect(error?.code).toBe('42501')
      expect(error?.message).toMatch(/permission denied/i)
    })

    it(`service_role (la API) sigue ejecutando ${nombre}`, async () => {
      const { error } = await service.rpc(nombre as never, args as never)
      expect(error).toBeNull()
    })
  }

  it('authenticated sigue obteniendo current_service_date (negocios, jornada)', async () => {
    const { data, error } = await user.rpc('current_service_date')
    expect(error).toBeNull()
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const { data: esperado } = await service.rpc('current_service_date')
    expect(data).toBe(esperado)
  })

  it('authenticated sigue obteniendo effective_max_change (checkout del cliente)', async () => {
    const { data, error } = await user.rpc('effective_max_change', { p_business_id: BUSINESS_ID })
    expect(error).toBeNull()
    expect(typeof data).toBe('number')
    const { data: esperado } = await service.rpc('effective_max_change', {
      p_business_id: BUSINESS_ID,
    })
    expect(data).toBe(esperado)
  })

  it('authenticated sigue obteniendo get_courier_tracking de un pedido de Entregas', async () => {
    const { data, error } = await user.rpc('get_courier_tracking', { p_short_id: shortId })
    expect(error).toBeNull()
    const tracking = data as { shortId: string; status: string } | null
    expect(tracking?.shortId).toBe(shortId)
    expect(tracking?.status).toBe('requested')
  })

  it('service_role sigue ejecutando las 3 que conservan authenticated', async () => {
    for (const [nombre, args] of SOLO_ANON) {
      const { error } = await service.rpc(nombre as never, args as never)
      expect(error, nombre).toBeNull()
    }
  })
})
