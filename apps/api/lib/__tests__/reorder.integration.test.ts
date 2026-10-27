/** D-51: repetir un pedido rearma su bolsa con el menú de hoy, contra la base local. */
import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as postQuote } from '../../app/api/v1/customer/checkout/quote/route'
import { GET as getReorder } from '../../app/api/v1/customer/orders/[id]/reorder/route'
import { POST as postOrder } from '../../app/api/v1/customer/orders/route'
import { localClient as db } from './helpers/local-db'

// Los temporizadores externos no forman parte de la prueba; Auth y PostgREST son reales.
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
const pizzaId = crypto.randomUUID()
const soupId = crypto.randomUUID()
const sizeGroupId = crypto.randomUUID()
const extrasGroupId = crypto.randomUUID()
const largeId = crypto.randomUUID()
const cheeseId = crypto.randomUUID()
const password = 'test-password-12345'
const authIds: string[] = []
const customers: { id: string; token: string; phone: string }[] = []

async function signIn(email: string): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error('No se pudo iniciar la sesión de prueba')
  return data.session.access_token
}

beforeAll(async () => {
  // Nombres reconocidos por el barrido existente si se interrumpe la corrida.
  for (const name of ['Test Business Owner', 'Vecino Integración', 'Vecino Integración']) {
    const email = `reorder-${crypto.randomUUID()}@integration.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    })
    if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`)
    authIds.push(data.user.id)
    if (name === 'Test Business Owner') {
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
      continue
    }
    const phone = `9${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
    await db
      .from('customer_profiles')
      .insert({
        user_id: data.user.id,
        full_name: name,
        phone: `+51${phone}`,
        phone_verified_at: new Date().toISOString(),
      })
      .throwOnError()
    customers.push({ id: data.user.id, token: await signIn(email), phone })
  }
  await db
    .from('menu_categories')
    .insert({ id: categoryId, business_id: businessId, name: 'Platos' })
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
    .from('menu_modifier_options')
    .insert([
      {
        id: crypto.randomUUID(),
        group_id: sizeGroupId,
        name: 'Pequeña',
        additional_price: 10,
        display_order: 0,
      },
      {
        id: largeId,
        group_id: sizeGroupId,
        name: 'Grande',
        additional_price: 20,
        display_order: 1,
      },
      {
        id: cheeseId,
        group_id: extrasGroupId,
        name: 'Queso',
        additional_price: 1.5,
        display_order: 0,
      },
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
  // Cada prueba parte del mismo menú.
  await db.from('menu_item_modifier_groups').delete().in('item_id', [pizzaId, soupId])
  await db.from('menu_items').delete().in('id', [pizzaId, soupId])
  await db
    .from('menu_items')
    .insert([
      {
        id: pizzaId,
        business_id: businessId,
        category_id: categoryId,
        name: 'Pizza',
        base_price: 5,
        is_available: true,
        image_url: 'https://example.invalid/pizza.jpg',
      },
      {
        id: soupId,
        business_id: businessId,
        category_id: categoryId,
        name: 'Sopa',
        base_price: 10,
        is_available: true,
      },
    ])
    .throwOnError()
  await db
    .from('menu_item_modifier_groups')
    .insert([
      { item_id: pizzaId, group_id: sizeGroupId, display_order: 0 },
      { item_id: pizzaId, group_id: extrasGroupId, display_order: 1 },
    ])
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
  for (const c of customers) {
    await db.from('creation_idempotency').delete().eq('user_id', c.id).throwOnError()
  }
})

afterAll(async () => {
  await db.from('menu_item_modifier_groups').delete().in('item_id', [pizzaId, soupId])
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
  await db.from('menu_items').delete().in('id', [pizzaId, soupId]).throwOnError()
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

const owner = () => customers[0] as { id: string; token: string; phone: string }
const stranger = () => customers[1] as { id: string; token: string; phone: string }

async function placeOrder(): Promise<string> {
  const res = await postOrder(
    new Request('http://localhost:3001/api/v1/customer/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${owner().token}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        businessId,
        deliveryMethod: 'pickup',
        paymentIntent: 'prepaid',
        pickupTiming: 'later',
        customerName: 'Vecino Integración',
        customerPhone: owner().phone,
        items: [
          // Las opciones van al revés del menú: la respuesta las ordena como el menú.
          { menuItemId: pizzaId, quantity: 2, note: 'sin cebolla', modifiers: [cheeseId, largeId] },
          { menuItemId: soupId, quantity: 1 },
        ],
      }),
    }),
  )
  expect(res.status).toBe(201)
  return ((await res.json()) as { data: { id: string } }).data.id
}

function reorder(id: string, token: string | null = owner().token) {
  return getReorder(
    new Request(`http://localhost:3001/api/v1/customer/orders/${id}/reorder`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) },
  )
}

type Reorder = {
  orderId: string
  businessName: string
  items: {
    menuItemId: string
    name: string
    quantity: number
    note: string | null
    basePrice: string
    modifiers: { id: string; groupName: string; optionName: string; price: string }[]
    unitPrice: string
    imageUrl: string | null
  }[]
  changes: {
    kind: string
    itemName: string
    menuItemId: string | null
    before: string | null
    after: string | null
  }[]
}

async function body(res: Response): Promise<Reorder> {
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: Reorder }).data
}

describe('GET /customer/orders/{id}/reorder (D-51)', () => {
  it('sin cambios: la bolsa vuelve igual y sirve tal cual para cotizar', async () => {
    const id = await placeOrder()
    const data = await body(await reorder(id))
    expect(data).toMatchObject({
      orderId: id,
      businessName: 'Test Restaurant Integration',
      changes: [],
    })
    const pizza = data.items.find((i) => i.menuItemId === pizzaId)
    expect(pizza).toEqual({
      menuItemId: pizzaId,
      name: 'Pizza',
      quantity: 2,
      note: 'sin cebolla',
      basePrice: '5.00',
      modifiers: [
        { id: largeId, groupName: 'Tamaño', optionName: 'Grande', price: '20.00' },
        { id: cheeseId, groupName: 'Extras', optionName: 'Queso', price: '1.50' },
      ],
      unitPrice: '26.50',
      imageUrl: 'https://example.invalid/pizza.jpg',
      thumbnailUrl: null,
    })
    expect(data.items.map((i) => i.menuItemId).sort()).toEqual([pizzaId, soupId].sort())

    // Ida y vuelta: lo que devuelve, la cotización lo acepta con el mismo precio.
    const quote = await postQuote(
      new Request('http://localhost:3001/api/v1/customer/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${owner().token}` },
        body: JSON.stringify({
          businessId,
          deliveryMethod: 'pickup',
          items: data.items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            modifiers: i.modifiers.map((m) => m.id),
          })),
        }),
      }),
    )
    expect(quote.status).toBe(200)
    const quoted = (
      (await quote.json()) as { data: { items: { menuItemId: string; unitPrice: string }[] } }
    ).data.items
    for (const item of data.items) {
      expect(quoted.find((q) => q.menuItemId === item.menuItemId)?.unitPrice).toBe(item.unitPrice)
    }
  })

  it('precio nuevo, opción agotada, plato agotado y plato borrado', async () => {
    const id = await placeOrder()
    await db.from('menu_items').update({ base_price: 12 }).eq('id', soupId).throwOnError()
    await db
      .from('menu_modifier_options')
      .update({ is_available: false })
      .eq('id', cheeseId)
      .throwOnError()
    let data = await body(await reorder(id))
    expect(data.items.map((i) => [i.name, i.unitPrice])).toEqual([['Sopa', '12.00']])
    expect(data.changes).toEqual(
      expect.arrayContaining([
        { kind: 'choose_again', itemName: 'Pizza', menuItemId: pizzaId, before: null, after: null },
        {
          kind: 'price_changed',
          itemName: 'Sopa',
          menuItemId: soupId,
          before: '10.00',
          after: '12.00',
        },
      ]),
    )
    expect(data.changes).toHaveLength(2)

    await db.from('menu_items').update({ is_available: false }).eq('id', soupId).throwOnError()
    await db
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', pizzaId)
      .throwOnError()
    data = await body(await reorder(id))
    expect(data.items).toEqual([])
    expect(data.changes).toEqual(
      expect.arrayContaining([
        { kind: 'item_removed', itemName: 'Pizza', menuItemId: null, before: null, after: null },
        {
          kind: 'item_unavailable',
          itemName: 'Sopa',
          menuItemId: soupId,
          before: null,
          after: null,
        },
      ]),
    )
  })

  it('una opción de un grupo que el plato ya no tiene obliga a volver a elegir', async () => {
    const id = await placeOrder()
    await db
      .from('menu_item_modifier_groups')
      .delete()
      .eq('item_id', pizzaId)
      .eq('group_id', extrasGroupId)
      .throwOnError()
    // La pizza ya no tiene «Extras»: su «Queso» no se puede rearmar.
    const data = await body(await reorder(id))
    expect(data.changes).toMatchObject([{ kind: 'choose_again', menuItemId: pizzaId }])
  })

  it('no confirma que exista un pedido ajeno o inventado, ni responde sin sesión', async () => {
    const id = await placeOrder()
    // Ajeno e inventado dan el mismo cuerpo; solo cambia el requestId de cada llamada.
    const notFound = async (res: Response) => {
      expect(res.status).toBe(404)
      const text = await res.text()
      expect(text).not.toContain(id)
      expect(text).not.toContain('Test Restaurant Integration')
      const { requestId, ...rest } = JSON.parse(text) as Record<string, unknown>
      expect(typeof requestId).toBe('string')
      return rest
    }
    const foreign = await notFound(await reorder(id, stranger().token))
    const invented = await notFound(await reorder(crypto.randomUUID()))
    expect(foreign).toEqual(invented)
    expect((await reorder(id, null)).status).toBe(401)
    expect((await reorder('no-es-un-id')).status).toBe(422)
    // Repetir no crea nada.
    const { count } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .throwOnError()
    expect(count).toBe(1)
  })

  it('una sesión válida sin el rol de cliente: 403, sin datos del pedido', async () => {
    const id = await placeOrder()
    const email = `reorder-${crypto.randomUUID()}@integration.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Vecino Integración' },
    })
    if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`)
    authIds.push(data.user.id)
    await db.from('user_roles').delete().eq('user_id', data.user.id).throwOnError()
    await db.from('user_roles').insert({ user_id: data.user.id, role: 'driver' }).throwOnError()
    // Aunque el pedido fuera suyo, sin el rol no llega a leerlo.
    await db.from('orders').update({ customer_user_id: data.user.id }).eq('id', id).throwOnError()
    const res = await reorder(id, await signIn(email))
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(text).not.toContain(id)
    expect(text).not.toContain('Pizza')
    expect(text).not.toContain('Test Restaurant Integration')
  })
})
