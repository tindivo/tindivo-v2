/**
 * Test de INTEGRACIÓN: Métricas de monitoreo online y oportunidad de conversión (0192).
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db'
import { requirePresent } from './helpers/require-present'

// Las dos RPC de monitoreo devuelven `jsonb` (`Returns: Json` en los tipos
// generados), así que TypeScript no sabe nada de su forma. El contrato que este
// test da por bueno se escribe aquí en vez de con `any`: un campo mal escrito
// en un assert pasa a ser error de compilación, y si la RPC cambia de forma
// queda a la vista qué esperaba el test.

type ConversionContact = {
  phone: string
  segment: string
  orders_count: number
  businesses: string[]
}

type ConversionStats = {
  segments: { A: number; B: number; C: number; D: number }
  actionable_contacts: ConversionContact[]
  summary: { profiles_without_phone: number; with_account: number }
}

type OnlineOrdersStats = {
  from: string
  to: string
  series: unknown[]
  totals: { creados: number; entregados: number; cancelados: number; tasa_entrega: number }
}

describe('Monitoreo Online & Oportunidad de Conversión (0192)', () => {
  const testId = String(Math.floor(100000 + Math.random() * 900000))
  const phoneLegacyOnly = `999${testId}` // D: alto times_used pero 0 en v2
  const phoneSegA = `988${testId}` // A: 5 pedidos v2
  const phoneSegB = `977${testId}` // B: 3 pedidos v2
  const phoneSegC = `966${testId}` // C: 1 pedido v2
  const phoneMatched = `955${testId}` // Con cuenta (distintos formatos)

  let businessId: string
  let businessUserId: string
  let customerProfileUserId: string
  let customerNoPhoneUserId: string

  const createdOrderIds: string[] = []
  const createdDirIds: string[] = []

  beforeAll(async () => {
    // 1. Crear usuario de negocio
    businessUserId = crypto.randomUUID()
    await localClient.auth.admin.createUser({
      email: `biz-${testId}@integration.local`,
      password: 'password123',
      id: businessUserId,
      email_confirm: true,
    })

    // 2. Crear negocio
    businessId = crypto.randomUUID()
    const { error: bErr } = await localClient.from('businesses').insert({
      id: businessId,
      name: `Restaurante Test ${testId}`,
      slug: `biz-test-${testId}`,
      user_id: businessUserId,
      accent_color: 'f97316',
      primary_capability: 'catalog_full',
    })
    if (bErr) throw bErr

    // 3. Crear usuario con perfil y teléfono con prefijo +51 y espacios
    customerProfileUserId = crypto.randomUUID()
    await localClient.auth.admin.createUser({
      email: `cust-${testId}@integration.local`,
      password: 'password123',
      id: customerProfileUserId,
      email_confirm: true,
    })
    const { error: cpErr1 } = await localClient.from('customer_profiles').insert({
      user_id: customerProfileUserId,
      full_name: 'Cliente Con Cuenta',
      phone: `+51 ${phoneMatched.slice(0, 3)} ${phoneMatched.slice(3, 6)} ${phoneMatched.slice(6)}`,
    })
    if (cpErr1) throw cpErr1

    // 4. Crear usuario sin teléfono
    customerNoPhoneUserId = crypto.randomUUID()
    await localClient.auth.admin.createUser({
      email: `nophone-${testId}@integration.local`,
      password: 'password123',
      id: customerNoPhoneUserId,
      email_confirm: true,
    })
    const { error: cpErr2 } = await localClient.from('customer_profiles').insert({
      user_id: customerNoPhoneUserId,
      full_name: 'Cliente Sin Telefono',
      phone: null,
    })
    if (cpErr2) throw cpErr2

    // 5. Sembrar address_directory
    // a) Legacy only: times_used = 25 pero 0 pedidos en v2
    const { data: dir1, error: dirErr1 } = await localClient
      .from('address_directory')
      .insert({
        phone: phoneLegacyOnly,
        customer_name: 'Cliente Legacy Alto TimesUsed',
        reference: 'Jr. Comercio 123',
        times_used: 25,
        source: 'backfill',
      })
      .select('id')
      .single()
    if (dirErr1) throw dirErr1
    if (dir1) createdDirIds.push(dir1.id)

    // b) Segmento A: sin cuenta, 5 pedidos v2
    const { data: dirA, error: dirErrA } = await localClient
      .from('address_directory')
      .insert({
        phone: phoneSegA,
        customer_name: 'Cliente Frecuente A',
        reference: 'Av. Principal 456',
        times_used: 0,
        source: 'driver_verified',
      })
      .select('id')
      .single()
    if (dirErrA) throw dirErrA
    if (dirA) createdDirIds.push(dirA.id)

    // c) Segmento B: sin cuenta, 3 pedidos v2
    const { data: dirB, error: dirErrB } = await localClient
      .from('address_directory')
      .insert({
        phone: phoneSegB,
        customer_name: 'Cliente Ocasional B',
        reference: 'Calle Los Pinos 789',
        times_used: 0,
        source: 'driver_verified',
      })
      .select('id')
      .single()
    if (dirErrB) throw dirErrB
    if (dirB) createdDirIds.push(dirB.id)

    // d) Segmento C: sin cuenta, 1 pedido v2
    const { data: dirC, error: dirErrC } = await localClient
      .from('address_directory')
      .insert({
        phone: phoneSegC,
        customer_name: 'Cliente Un Solo Pedido C',
        reference: 'Pasaje San Martin 101',
        times_used: 0,
        source: 'admin_curated',
      })
      .select('id')
      .single()
    if (dirErrC) throw dirErrC
    if (dirC) createdDirIds.push(dirC.id)

    // e) Con cuenta (teléfono sin prefijo en address_directory, con +51 en profiles)
    const { data: dirMatched, error: dirErrM } = await localClient
      .from('address_directory')
      .insert({
        phone: phoneMatched,
        customer_name: 'Cliente Con Cuenta Match',
        reference: 'Av. Las Palmeras 202',
        times_used: 2,
        source: 'admin_curated',
      })
      .select('id')
      .single()
    if (dirErrM) throw dirErrM
    if (dirMatched) createdDirIds.push(dirMatched.id)

    const genShortId = () =>
      Array.from({ length: 8 }, () =>
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)),
      ).join('')

    // 6. Sembrar pedidos manuales v2
    // 5 pedidos para Segmento A
    for (let i = 0; i < 5; i++) {
      const { data: o, error: oErr } = await localClient
        .from('orders')
        .insert({
          business_id: businessId,
          order_number: 1000 + i,
          short_id: genShortId(),
          customer_phone: phoneSegA,
          address_directory_id: dirA?.id ?? null,
          customer_name: 'Cliente Frecuente A',
          delivery_address: 'Av. Principal 456',
          delivery_reference: 'Av. Principal 456',
          order_amount: 30,
          delivery_fee: 4,
          source: 'business_manual',
          status: 'delivered',
          delivery_method: 'delivery',
          payment_intent: 'pending_cash',
          occupancy_slots: 1,
        })
        .select('id')
        .single()
      if (oErr) throw oErr
      if (o) createdOrderIds.push(o.id)
    }

    // 3 pedidos para Segmento B
    for (let i = 0; i < 3; i++) {
      const { data: o, error: oErr } = await localClient
        .from('orders')
        .insert({
          business_id: businessId,
          order_number: 2000 + i,
          short_id: genShortId(),
          customer_phone: phoneSegB,
          address_directory_id: dirB?.id ?? null,
          customer_name: 'Cliente Ocasional B',
          delivery_address: 'Calle Los Pinos 789',
          delivery_reference: 'Calle Los Pinos 789',
          order_amount: 25,
          delivery_fee: 4,
          source: 'business_manual',
          status: 'delivered',
          delivery_method: 'delivery',
          payment_intent: 'pending_cash',
          occupancy_slots: 1,
        })
        .select('id')
        .single()
      if (oErr) throw oErr
      if (o) createdOrderIds.push(o.id)
    }

    // 1 pedido para Segmento C
    const { data: oC, error: oCErr } = await localClient
      .from('orders')
      .insert({
        business_id: businessId,
        order_number: 3001,
        short_id: genShortId(),
        customer_phone: phoneSegC,
        address_directory_id: dirC?.id ?? null,
        customer_name: 'Cliente Un Solo Pedido C',
        delivery_address: 'Pasaje San Martin 101',
        delivery_reference: 'Pasaje San Martin 101',
        order_amount: 15,
        delivery_fee: 4,
        source: 'business_manual',
        status: 'delivered',
        delivery_method: 'delivery',
        payment_intent: 'pending_cash',
        occupancy_slots: 1,
      })
      .select('id')
      .single()
    if (oCErr) throw oCErr
    if (oC) createdOrderIds.push(oC.id)

    // 7. Sembrar pedidos online (customer_pwa) para test de online stats
    // 2 pedidos online: 1 delivered, 1 cancelled
    const { data: oPwaDelivered, error: pwaDelErr } = await localClient
      .from('orders')
      .insert({
        business_id: businessId,
        order_number: 4001,
        short_id: genShortId(),
        customer_user_id: customerProfileUserId,
        delivery_address: 'Av. Las Palmeras 202',
        delivery_reference: 'Av. Las Palmeras 202',
        order_amount: 40,
        delivery_fee: 4,
        source: 'customer_pwa',
        status: 'delivered',
        delivery_method: 'delivery',
        payment_intent: 'pending_cash',
        occupancy_slots: 1,
      })
      .select('id')
      .single()
    if (pwaDelErr) throw pwaDelErr
    if (oPwaDelivered) createdOrderIds.push(oPwaDelivered.id)

    const { data: oPwaCancelled, error: pwaCancErr } = await localClient
      .from('orders')
      .insert({
        business_id: businessId,
        order_number: 4002,
        short_id: genShortId(),
        customer_user_id: customerProfileUserId,
        delivery_address: 'Av. Las Palmeras 202',
        delivery_reference: 'Av. Las Palmeras 202',
        order_amount: 35,
        delivery_fee: 4,
        source: 'customer_pwa',
        status: 'cancelled',
        delivery_method: 'delivery',
        payment_intent: 'pending_cash',
        occupancy_slots: 1,
      })
      .select('id')
      .single()
    if (pwaCancErr) throw pwaCancErr
    if (oPwaCancelled) createdOrderIds.push(oPwaCancelled.id)
  })

  afterAll(async () => {
    // Cleanup
    if (createdOrderIds.length > 0) {
      await localClient.from('orders').delete().in('id', createdOrderIds)
    }
    if (createdDirIds.length > 0) {
      await localClient.from('address_directory').delete().in('id', createdDirIds)
    }
    if (businessId) {
      await localClient.from('businesses').delete().eq('id', businessId)
    }
    if (businessUserId) {
      await localClient.auth.admin.deleteUser(businessUserId)
    }
    if (customerProfileUserId) {
      await localClient.auth.admin.deleteUser(customerProfileUserId)
    }
    if (customerNoPhoneUserId) {
      await localClient.auth.admin.deleteUser(customerNoPhoneUserId)
    }
  })

  it('admin_conversion_opportunity_stats: clasifica teléfono legacy en Segmento D y NO en A o B', async () => {
    const { data, error } = await localClient.rpc('admin_conversion_opportunity_stats')
    expect(error).toBeNull()
    expect(data).toBeDefined()

    const stats = data as unknown as ConversionStats
    const segments = stats.segments
    const actionable = stats.actionable_contacts

    // El teléfono legacy (times_used = 25 pero 0 pedidos v2) NO debe aparecer en la lista accionable
    const inActionable = actionable.find((c) => c.phone === phoneLegacyOnly)
    expect(inActionable).toBeUndefined()

    // El teléfono de Segmento A (5 pedidos v2) DEBE estar en la lista accionable como 'A'
    const contactA = requirePresent(
      actionable.find((c) => c.phone === phoneSegA),
      `el contacto accionable ${phoneSegA} (Segmento A)`,
    )
    expect(contactA.segment).toBe('A')
    expect(contactA.orders_count).toBe(5)
    expect(contactA.businesses).toContain(`Restaurante Test ${testId}`)

    // El teléfono de Segmento B (3 pedidos v2) DEBE estar en la lista accionable como 'B'
    const contactB = requirePresent(
      actionable.find((c) => c.phone === phoneSegB),
      `el contacto accionable ${phoneSegB} (Segmento B)`,
    )
    expect(contactB.segment).toBe('B')
    expect(contactB.orders_count).toBe(3)

    // El teléfono de Segmento C (1 pedido v2) NO debe estar en la lista accionable (A+B)
    const contactC = actionable.find((c) => c.phone === phoneSegC)
    expect(contactC).toBeUndefined()

    // Comprobar que hay conteo en D mayor a 0
    expect(segments.D).toBeGreaterThanOrEqual(1)
    expect(segments.A).toBeGreaterThanOrEqual(1)
    expect(segments.B).toBeGreaterThanOrEqual(1)
    expect(segments.C).toBeGreaterThanOrEqual(1)
  })

  it('admin_conversion_opportunity_stats: normaliza teléfonos en distintos formatos y cruza con cuenta', async () => {
    const { data, error } = await localClient.rpc('admin_conversion_opportunity_stats')
    expect(error).toBeNull()

    const stats = data as unknown as ConversionStats

    // phoneMatched tiene cuenta en customer_profiles con formato "+51 955 ...", en directory "955..."
    // Por lo tanto NO debe figurar en actionable_contacts (ya tiene cuenta)
    const matchedInActionable = stats.actionable_contacts.find((c) => c.phone === phoneMatched)
    expect(matchedInActionable).toBeUndefined()

    // Perfiles sin teléfono debe ser al menos 1
    expect(stats.summary.profiles_without_phone).toBeGreaterThanOrEqual(1)
    expect(stats.summary.with_account).toBeGreaterThanOrEqual(1)
  })

  it('admin_online_orders_stats: agrega pedidos customer_pwa por current_service_date y calcula tasa de entrega', async () => {
    const { data, error } = await localClient.rpc('admin_online_orders_stats')
    expect(error).toBeNull()
    expect(data).toBeDefined()

    const stats = data as unknown as OnlineOrdersStats
    expect(stats.from).toBeDefined()
    expect(stats.to).toBeDefined()
    expect(Array.isArray(stats.series)).toBe(true)
    expect(stats.totals).toBeDefined()

    // Los 2 pedidos online sembrados deben reflejarse en los totales
    expect(stats.totals.creados).toBeGreaterThanOrEqual(2)
    expect(stats.totals.entregados).toBeGreaterThanOrEqual(1)
    expect(stats.totals.cancelados).toBeGreaterThanOrEqual(1)
    expect(stats.totals.tasa_entrega).toBeGreaterThan(0)
  })
})
