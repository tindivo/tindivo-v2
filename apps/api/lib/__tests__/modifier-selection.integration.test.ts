/** La cotización y el pedido rechazan las mismas selecciones (0275), contra la base local. */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@tindivo/supabase'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as postQuote } from '../../app/api/v1/customer/checkout/quote/route'
import { POST as postOrder } from '../../app/api/v1/customer/orders/route'
import { localClient as db } from './helpers/local-db'

// Los temporizadores externos no forman parte de la validación; Auth y PostgREST son reales.
vi.mock('../inngest/client', () => ({
  sendOrderCreated: vi.fn().mockResolvedValue(undefined),
  sendOrderValidation: vi.fn().mockResolvedValue(undefined),
}))

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const businessId = crypto.randomUUID()
const categoryId = crypto.randomUUID()
const dishId = crypto.randomUUID()
const plainDishId = crypto.randomUUID()
const sizeGroupId = crypto.randomUUID()
const extrasGroupId = crypto.randomUUID()
const smallId = crypto.randomUUID()
const largeId = crypto.randomUUID()
const cheeseId = crypto.randomUUID()
const sauceId = crypto.randomUUID()
const friesId = crypto.randomUUID()
const password = 'test-password-12345'
const phone = `9${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const authIds: string[] = []
let customerId = ''
let token = ''

beforeAll(async () => {
  // Nombres reconocidos por el barrido existente si se interrumpe la corrida.
  for (const name of ['Test Business Owner', 'Vecino Integración']) {
    const email = `options-${crypto.randomUUID()}@integration.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    })
    if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`)
    authIds.push(data.user.id)
    if (name === 'Vecino Integración') {
      customerId = data.user.id
      await db
        .from('customer_profiles')
        .insert({
          user_id: customerId,
          full_name: name,
          phone: `+51${phone}`,
          phone_verified_at: new Date().toISOString(),
        })
        .throwOnError()
      const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
      const { data: session, error: loginError } = await anon.auth.signInWithPassword({
        email,
        password,
      })
      if (loginError || !session.session) throw new Error('No se pudo iniciar la sesión de prueba')
      token = session.session.access_token
    } else {
      await db
        .from('businesses')
        .insert({
          id: businessId,
          user_id: data.user.id,
          name: 'Test Restaurant Integration',
          is_active: true,
          is_blocked: false,
          publishes_catalog: true,
          accepts_web_pickup: true,
          accepting_orders_until: null,
        })
        .throwOnError()
    }
  }
  await db
    .from('menu_categories')
    .insert({ id: categoryId, business_id: businessId, name: 'Platos' })
    .throwOnError()
  await db
    .from('menu_items')
    .insert([
      {
        id: dishId,
        business_id: businessId,
        category_id: categoryId,
        name: 'Pizza',
        base_price: 0,
        is_available: true,
      },
      {
        id: plainDishId,
        business_id: businessId,
        category_id: categoryId,
        name: 'Sopa',
        base_price: 10,
        is_available: true,
      },
    ])
    .throwOnError()
  await db
    .from('menu_modifier_groups')
    .insert([
      {
        id: sizeGroupId,
        business_id: businessId,
        name: 'Tamaño',
        selection_type: 'single',
        is_required: true,
        min_selections: 1,
        max_selections: 1,
      },
      {
        id: extrasGroupId,
        business_id: businessId,
        name: 'Extras',
        selection_type: 'multi',
        is_required: false,
        min_selections: 0,
        max_selections: 2,
      },
    ])
    .throwOnError()
  await db
    .from('menu_item_modifier_groups')
    .insert([
      { item_id: dishId, group_id: sizeGroupId, display_order: 0 },
      { item_id: dishId, group_id: extrasGroupId, display_order: 1 },
    ])
    .throwOnError()
  await db
    .from('menu_modifier_options')
    .insert([
      { id: smallId, group_id: sizeGroupId, name: 'Pequeña', additional_price: 10 },
      { id: largeId, group_id: sizeGroupId, name: 'Grande', additional_price: 20 },
      { id: cheeseId, group_id: extrasGroupId, name: 'Queso', additional_price: 1 },
      { id: sauceId, group_id: extrasGroupId, name: 'Salsa', additional_price: 2 },
      { id: friesId, group_id: extrasGroupId, name: 'Papas', additional_price: 3 },
    ])
    .throwOnError()
})

beforeEach(async () => {
  const { data: serviceDate, error } = await db.rpc('current_service_date')
  if (error || !serviceDate) throw new Error('No se pudo obtener la jornada de prueba')
  await db
    .from('business_service_days')
    .upsert({ business_id: businessId, service_date: serviceDate, status: 'open' })
    .throwOnError()
  await db
    .from('menu_modifier_groups')
    .update({ is_required: false, min_selections: 0, max_selections: 2 })
    .eq('id', extrasGroupId)
    .throwOnError()
  await db
    .from('menu_modifier_options')
    .update({ is_available: true })
    .in('group_id', [sizeGroupId, extrasGroupId])
    .throwOnError()
})

afterEach(async () => {
  const { data: orders } = await db
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .throwOnError()
  for (const order of orders ?? []) {
    await db.from('domain_events').delete().eq('aggregate_id', order.id).throwOnError()
    await db.from('order_event_log').delete().eq('order_id', order.id).throwOnError()
    await db.from('customer_order_items').delete().eq('order_id', order.id).throwOnError()
    await db.from('orders').delete().eq('id', order.id).throwOnError()
  }
  if (customerId)
    await db.from('creation_idempotency').delete().eq('user_id', customerId).throwOnError()
})

afterAll(async () => {
  await db
    .from('menu_item_modifier_groups')
    .delete()
    .in('item_id', [dishId, plainDishId])
    .throwOnError()
  await db
    .from('menu_modifier_options')
    .delete()
    .in('group_id', [sizeGroupId, extrasGroupId])
    .throwOnError()
  await db
    .from('menu_modifier_groups')
    .delete()
    .in('id', [sizeGroupId, extrasGroupId])
    .throwOnError()
  await db.from('menu_items').delete().in('id', [dishId, plainDishId]).throwOnError()
  await db.from('menu_categories').delete().eq('id', categoryId).throwOnError()
  await db.from('business_service_days').delete().eq('business_id', businessId).throwOnError()
  await db.from('businesses').delete().eq('id', businessId).throwOnError()
  for (const id of authIds) {
    await db.from('customer_profiles').delete().eq('user_id', id).throwOnError()
    await db.from('user_roles').delete().eq('user_id', id).throwOnError()
    await db.from('users').delete().eq('id', id).throwOnError()
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) throw new Error(`No se pudo limpiar el usuario: ${error.message}`)
  }
})

type GroupPatch = Database['public']['Tables']['menu_modifier_groups']['Update']
type RequestItem = { menuItemId: string; quantity: number; modifiers?: string[] }

for (const endpoint of ['orders', 'checkout/quote'] as const) {
  describe(`POST /customer/${endpoint}`, () => {
    function request(
      modifiers: string[] | undefined,
      menuItemId = dishId,
      additionalItems: RequestItem[] = [],
      idempotencyKey: string = crypto.randomUUID(),
    ) {
      const item = { menuItemId, quantity: 2, ...(modifiers === undefined ? {} : { modifiers }) }
      return (endpoint === 'orders' ? postOrder : postQuote)(
        new Request(`http://localhost:3001/api/v1/customer/${endpoint}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            businessId,
            deliveryMethod: 'pickup',
            ...(endpoint === 'orders'
              ? {
                  paymentIntent: 'prepaid',
                  pickupTiming: 'later',
                  customerName: 'Vecino Integración',
                  customerPhone: phone,
                }
              : {}),
            items: [item, ...additionalItems],
          }),
        }),
      )
    }

    it.each([
      {
        name: 'obligatorio omitido',
        modifiers: undefined,
        message: 'Elige una opción de «Tamaño» en «Pizza».',
      },
      {
        name: 'obligatorio vacío',
        modifiers: [],
        message: 'Elige una opción de «Tamaño» en «Pizza».',
      },
      {
        name: 'single con dos opciones',
        modifiers: [smallId, largeId],
        message: 'En «Tamaño» de «Pizza» solo puedes elegir una opción.',
      },
      {
        name: 'multi supera el máximo',
        modifiers: [smallId, cheeseId, sauceId, friesId],
        message: 'En «Extras» de «Pizza» puedes elegir hasta 2 opciones.',
      },
      {
        name: 'opción repetida',
        modifiers: [smallId, cheeseId, cheeseId],
        message: 'Hay una opción repetida en «Pizza».',
      },
      {
        name: 'opción repetida y agotada: prevalece la repetida',
        modifiers: [smallId, cheeseId, cheeseId],
        unavailableOptionId: cheeseId,
        message: 'Hay una opción repetida en «Pizza».',
      },
      {
        name: 'el mismo UUID en minúsculas y mayúsculas',
        modifiers: [smallId, cheeseId, cheeseId.toUpperCase()],
        message: 'Hay una opción repetida en «Pizza».',
      },
      {
        name: 'la segunda línea incumple una regla: también se revierte la primera',
        modifiers: [smallId],
        additionalItems: [{ menuItemId: dishId, quantity: 1, modifiers: [] }],
        message: 'Elige una opción de «Tamaño» en «Pizza».',
      },
      {
        name: 'multi obligatorio sin elegir',
        modifiers: [smallId],
        patch: { is_required: true, min_selections: 2 },
        message: 'Elige al menos 2 opciones de «Extras» en «Pizza».',
      },
      {
        name: 'multi por debajo del mínimo',
        modifiers: [smallId, cheeseId],
        patch: { is_required: true, min_selections: 2 },
        message: 'Elige al menos 2 opciones de «Extras» en «Pizza».',
      },
    ] satisfies {
      name: string
      modifiers: string[] | undefined
      message: string
      patch?: GroupPatch
      unavailableOptionId?: string
      additionalItems?: RequestItem[]
    }[])('422: $name', async (test) => {
      if ('patch' in test)
        await db
          .from('menu_modifier_groups')
          .update(test.patch)
          .eq('id', extrasGroupId)
          .throwOnError()
      if ('unavailableOptionId' in test) {
        await db
          .from('menu_modifier_options')
          .update({ is_available: false })
          .eq('id', test.unavailableOptionId)
          .throwOnError()
      }
      const response = await request(
        test.modifiers,
        dishId,
        'additionalItems' in test ? test.additionalItems : [],
      )
      const problem: { code: string; detail: string } = await response.json()
      expect({ status: response.status, code: problem.code, detail: problem.detail }).toEqual({
        status: 422,
        code: 'validation_error',
        detail: test.message,
      })
      const { count } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .throwOnError()
      expect(count).toBe(0)
      const { count: lines } = await db
        .from('customer_order_items')
        .select('id', { count: 'exact', head: true })
        .in('menu_item_id', [dishId, plainDishId])
        .throwOnError()
      expect(lines).toBe(0)
      const { count: events } = await db
        .from('domain_events')
        .select('id', { count: 'exact', head: true })
        .eq('aggregate_type', 'order')
        .contains('payload', { businessId })
        .throwOnError()
      expect(events).toBe(0)
      const { count: logs } = await db
        .from('order_event_log')
        .select('id', { count: 'exact', head: true })
        .eq('actor_user_id', customerId)
        .throwOnError()
      expect(logs).toBe(0)
      const { count: keys } = await db
        .from('creation_idempotency')
        .select('key', { count: 'exact', head: true })
        .eq('user_id', customerId)
        .throwOnError()
      expect(keys).toBe(0)
    })

    it.runIf(endpoint === 'orders')(
      'un reintento con la misma clave y UUID en mayúsculas devuelve el pedido original sin crear otro',
      async () => {
        const key = crypto.randomUUID()
        const upper = [smallId, cheeseId].map((id) => id.toUpperCase())
        const first = await request(upper, dishId.toUpperCase(), [], key)
        expect(first.status).toBe(201)
        const firstBody = await first.json()

        const replay = await request(upper, dishId.toUpperCase(), [], key)
        expect(replay.status).toBe(201)
        expect(replay.headers.get('idempotency-replayed')).toBe('true')
        expect(await replay.json()).toEqual(firstBody)

        // Misma clave con otro contenido: conflicto, no un pedido nuevo.
        const changed = await request([smallId], dishId, [], key)
        expect(changed.status).toBe(409)

        const { count } = await db
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .throwOnError()
        expect(count).toBe(1)
      },
    )

    it.each([
      'minúsculas',
      'mayúsculas',
    ])('selección válida en %s: conserva el precio y las opciones en el máximo y mínimo', async (casing) => {
      await db
        .from('menu_modifier_groups')
        .update({ is_required: true, min_selections: 2 })
        .eq('id', extrasGroupId)
        .throwOnError()
      const optionIds = [smallId, cheeseId, sauceId]
      const response = await request(
        casing === 'mayúsculas' ? optionIds.map((id) => id.toUpperCase()) : optionIds,
        casing === 'mayúsculas' ? dishId.toUpperCase() : dishId,
      )
      expect(response.status).toBe(endpoint === 'orders' ? 201 : 200)
      // (0 + 10 + 1 + 2) × 2 = 26, sin envío al recoger.
      if (endpoint === 'checkout/quote') {
        expect(await response.json()).toMatchObject({
          data: {
            subtotal: '26.00',
            deliveryFee: '0.00',
            total: '26.00',
            items: [{ unitPrice: '13.00', lineTotal: '26.00' }],
          },
        })
      } else {
        expect(await response.json()).toMatchObject({
          data: { orderAmount: 26, deliveryFee: 0, total: 26 },
        })
        const { data: order } = await db
          .from('orders')
          .select('id,order_amount,delivery_fee')
          .eq('business_id', businessId)
          .single()
          .throwOnError()
        expect(order).toMatchObject({ order_amount: 26, delivery_fee: 0 })
        const { data: line } = await db
          .from('customer_order_items')
          .select('id,unit_price,line_total')
          .eq('order_id', order.id)
          .single()
          .throwOnError()
        expect(line).toMatchObject({ unit_price: 13, line_total: 26 })
        const { data: modifiers } = await db
          .from('customer_order_item_modifiers')
          .select('option_name_snapshot,additional_price_snapshot')
          .eq('item_id', line.id)
          .order('additional_price_snapshot')
          .throwOnError()
        expect(modifiers).toEqual([
          { option_name_snapshot: 'Queso', additional_price_snapshot: 1 },
          { option_name_snapshot: 'Salsa', additional_price_snapshot: 2 },
          { option_name_snapshot: 'Pequeña', additional_price_snapshot: 10 },
        ])
      }
    })

    it('un grupo opcional con min mayor que cero no exige elegir', async () => {
      await db
        .from('menu_modifier_groups')
        .update({ min_selections: 2 })
        .eq('id', extrasGroupId)
        .throwOnError()
      expect((await request([smallId])).status).toBe(endpoint === 'orders' ? 201 : 200)
    })

    it('un plato sin grupos sigue admitiendo un pedido sin opciones', async () => {
      expect((await request([], plainDishId)).status).toBe(endpoint === 'orders' ? 201 : 200)
    })

    it('una opción cuyo grupo no está vinculado al plato sigue siendo inválida', async () => {
      const response = await request([smallId], plainDishId)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'validation_error' })
    })
  })
}
