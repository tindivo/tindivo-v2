/**
 * MV4b: las rutas del cliente que la web resolvía directo contra Supabase.
 * Contra la base local.
 *
 *  · `POST /customer/checkout/quote`    decide la base, no la app; dinero como texto (D-39).
 *  · `/customer/addresses`              atómico: nunca dos predeterminadas; solo del dueño.
 *  · `GET /customer/orders` y `/{id}`   historial paginado por cursor; uno ajeno es 404.
 *  · `GET /customer/courier-orders`     historial y contactos frecuentes.
 *  · `POST /customer/terms-acceptance`  idempotente por versión.
 *
 * Clientes propios con el nombre `Vecino MV4b` (lo barre `vitest.global-setup.ts`
 * si la corrida muere); la zona lejana lleva el prefijo `ZZ Test MV4b`.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DELETE as deleteAddress,
  PATCH as patchAddress,
} from '../../app/api/v1/customer/addresses/[id]/route'
import { GET as getAddresses, POST as postAddress } from '../../app/api/v1/customer/addresses/route'
import { POST as postQuote } from '../../app/api/v1/customer/checkout/quote/route'
import { GET as getCourierHistory } from '../../app/api/v1/customer/courier-orders/route'
import { GET as getOrder } from '../../app/api/v1/customer/orders/[id]/route'
import { GET as getOrders, POST as postOrder } from '../../app/api/v1/customer/orders/route'
import { POST as postTerms } from '../../app/api/v1/customer/terms-acceptance/route'
import { E2E as FIXTURES } from '../../scripts/e2e-fixtures'
import { localClient as db } from './helpers/local-db'
import {
  COURIER_POINT_A,
  COURIER_POINT_B,
  callCreateCourierOrder,
} from './helpers/local-db-courier'

/**
 * Fallos de lectura inyectados (CAX-002). Por defecto no hace nada: los clientes de
 * Supabase que crean las rutas pasan tal cual. Una prueba apunta una lectura
 * (`reads`: tabla, columnas del `select` y filtros `eq`) o una RPC (`rpcs`) y esa
 * llamada, y solo esa, devuelve un error.
 */
const faults = vi.hoisted(() => {
  interface ReadFault {
    table: string
    select?: string
    eq?: [string, unknown]
  }
  const state = { reads: [] as ReadFault[], rpcs: [] as string[] }
  const error = { message: 'lectura inyectada', code: 'XX000', details: '', hint: '' }
  type Fn = (...args: unknown[]) => unknown
  const builder = (
    real: object,
    table: string,
    seen: { select?: string; eq: Array<[string, unknown]> },
  ): object =>
    new Proxy(real, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          if (prop === 'select') seen.select = String(args[0])
          if (prop === 'eq') seen.eq.push([String(args[0]), args[1]])
          if (prop === 'maybeSingle' || prop === 'single' || prop === 'then') {
            const hit = state.reads.some(
              (f) =>
                f.table === table &&
                (f.select === undefined || f.select === seen.select) &&
                (f.eq === undefined ||
                  seen.eq.some(([c, v]) => c === f.eq?.[0] && v === f.eq?.[1])),
            )
            if (hit) {
              const failed = Promise.resolve({ data: null, error })
              return prop === 'then' ? failed.then(...(args as [Fn, Fn])) : failed
            }
          }
          const next = (value as Fn).apply(target, args)
          if (prop === 'then') return next
          return next === target
            ? receiver
            : typeof next === 'object' && next !== null && 'then' in next
              ? builder(next, table, seen)
              : next
        }
      },
    })
  const wrap = <T extends object>(client: T): T =>
    new Proxy(client, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown
        if (prop === 'from' && typeof value === 'function') {
          return (table: string) =>
            builder((value as Fn).call(target, table) as object, table, { eq: [] })
        }
        if (prop === 'rpc' && typeof value === 'function') {
          return (name: string, ...rest: unknown[]) =>
            state.rpcs.includes(name)
              ? Promise.resolve({ data: null, error })
              : (value as Fn).call(target, name, ...rest)
        }
        return value
      },
    }) as T
  return { state, wrap }
})

vi.mock('@/lib/supabase/service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/supabase/service')>()
  return { ...real, createServiceClient: () => faults.wrap(real.createServiceClient()) }
})
vi.mock('@/lib/supabase/user', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/supabase/user')>()
  return { ...real, createUserClient: (token: string) => faults.wrap(real.createUserClient(token)) }
})

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const NOMBRE = 'Vecino MV4b'
const CLAVE = 'test-password-12345'
const ZONA = 'ZZ Test MV4b zona lejana'
const PIN = { lat: -9.151, lng: -78.28 }
const REF = 'Casa de dos pisos, prueba MV4b'

interface Cliente {
  id: string
  token: string
  tel9: string
}

const clientes: Cliente[] = []
let courierPrevio: unknown = null

const telefonoNuevo = (): string => `9${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const email = `mv4b-${tel9}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  const id = data.user.id
  const { error: perr } = await db.from('customer_profiles').insert({
    user_id: id,
    full_name: NOMBRE,
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
  })
  if (perr) throw new Error(`crear el perfil falló: ${perr.message}`)
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: serr } = await anon.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  const c = { id, token: s.session.access_token, tel9 }
  clientes.push(c)
  return c
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

async function pedir(
  handler: unknown,
  opts: {
    bearer?: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    params?: Record<string, string>
    qs?: string
  } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`
  Object.assign(headers, opts.headers)
  const res = await (handler as Handler)(
    new Request(`http://localhost:3001/api/v1/x${opts.qs ?? ''}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: Promise.resolve(opts.params ?? {}) },
  )
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
}

/** Un pedido de verdad (la RPC de la creación) y lo cancela para que el cliente quede libre. */
async function pedidoCancelado(c: Cliente, notas?: string): Promise<string> {
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: c.id,
    p_business_id: FIXTURES.BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'prepaid',
    p_customer_name: NOMBRE,
    p_customer_phone: c.tel9,
    p_delivery_address: 'Jr. Prueba 1',
    p_delivery_reference: 'Referencia de prueba MV4b',
    p_delivery_lat: PIN.lat,
    p_delivery_lng: PIN.lng,
    p_items: [
      { menu_item_id: FIXTURES.ITEM_POLLO_ID, quantity: 1, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
    ],
    p_source: 'customer_pwa',
    p_customer_notes: notas,
  })
  if (error) throw new Error(`create_customer_order: ${error.message}`)
  const id = (data as { id: string }).id
  await db
    .from('orders')
    .update({
      status: 'cancelled',
      cancel_reason: 'proof_rejected_final',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', id)
  return id
}

async function defaults(c: Cliente): Promise<string[]> {
  const { data } = await db
    .from('customer_addresses')
    .select('id')
    .eq('user_id', c.id)
    .eq('is_default', true)
  return (data ?? []).map((r) => r.id)
}

beforeAll(async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  courierPrevio = data?.value ?? null
  await db
    .from('app_settings')
    .update({
      value: { ...(courierPrevio as Record<string, unknown>), enabled: true, ignoreSchedule: true },
    })
    .eq('key', 'courier')
})

afterAll(async () => {
  if (courierPrevio) {
    await db
      .from('app_settings')
      .update({ value: courierPrevio as never })
      .eq('key', 'courier')
  }
  await db.from('delivery_zones').delete().eq('name', ZONA)
  await db.from('menu_items').update({ free_delivery_until: null }).eq('id', FIXTURES.ITEM_POLLO_ID)
  for (const c of clientes.splice(0)) {
    const { data: pedidos } = await db.from('orders').select('id').eq('customer_user_id', c.id)
    const ids = (pedidos ?? []).map((p) => p.id)
    if (ids.length > 0) {
      await db.from('business_charges').delete().in('order_id', ids)
      await db.from('domain_events').delete().in('aggregate_id', ids)
      await db.from('orders').delete().in('id', ids)
    }
    await db.from('courier_orders').delete().eq('customer_user_id', c.id)
    await db.from('customer_profiles').delete().eq('user_id', c.id)
    await db.from('users').delete().eq('id', c.id)
    await db.auth.admin.deleteUser(c.id)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /customer/checkout/quote', () => {
  const carrito = (extra: Record<string, unknown> = {}) => ({
    businessId: FIXTURES.BUSINESS_ID,
    deliveryMethod: 'pickup',
    items: [
      { menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 2, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
    ],
    ...extra,
  })

  it('sin sesión: 401', async () => {
    expect((await pedir(postQuote, { method: 'POST', body: carrito() })).status).toBe(401)
  })

  it('cuerpo inválido: 422', async () => {
    const c = await crearCliente()
    const r = await pedir(postQuote, { bearer: c.token, method: 'POST', body: { items: [] } })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('validation_error')
  })

  it('recojo: los precios los pone el servidor, el envío es cero y todo viaja como texto', async () => {
    const c = await crearCliente()
    const r = await pedir(postQuote, { bearer: c.token, method: 'POST', body: carrito() })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    const { data } = r.body
    // Pollo entero 45.00 + Extra queso 3.00 = 48.00 c/u, por 2.
    expect(data.items).toEqual([
      expect.objectContaining({ quantity: 2, unitPrice: '48.00', lineTotal: '96.00' }),
    ])
    expect(data).toMatchObject({
      subtotal: '96.00',
      deliveryBand: null,
      nominalDeliveryFee: '0.00',
      deliveryFee: '0.00',
      total: '96.00',
      freeDelivery: { applies: false, reason: null },
    })
    expect(data.maxChange).toMatch(/^\d+\.\d{2}$/)
    expect(data.prepayThreshold).toMatch(/^\d+\.\d{2}$/)
    expect(typeof data.exceedsPrepayThreshold).toBe('boolean')
  })

  it('delivery: la tarifa sale de app_settings.delivery_bands, y sin punto es la cercana', async () => {
    const c = await crearCliente()
    const { data: bands } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'delivery_bands')
      .single()
    const near = (bands?.value as { near: number }).near
    const r = await pedir(postQuote, {
      bearer: c.token,
      method: 'POST',
      body: carrito({ deliveryMethod: 'delivery' }),
    })
    expect(r.body.data.deliveryBand).toBe('near')
    expect(r.body.data.nominalDeliveryFee).toBe(near.toFixed(2))
    expect(r.body.data.deliveryFee).toBe(near.toFixed(2))
    expect(r.body.data.total).toBe((96 + near).toFixed(2))
  })

  it('una zona lejana encima del pin cobra la tarifa lejana (la banda la decide la base)', async () => {
    const c = await crearCliente()
    const { data: bands } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'delivery_bands')
      .single()
    const far = (bands?.value as { far: number }).far
    const { error } = await db.from('delivery_zones').insert({
      name: ZONA,
      polygon: [
        { lat: PIN.lat - 0.004, lng: PIN.lng - 0.004 },
        { lat: PIN.lat - 0.004, lng: PIN.lng + 0.004 },
        { lat: PIN.lat + 0.004, lng: PIN.lng + 0.004 },
        { lat: PIN.lat + 0.004, lng: PIN.lng - 0.004 },
      ],
    })
    if (error) throw new Error(error.message)
    try {
      const r = await pedir(postQuote, {
        bearer: c.token,
        method: 'POST',
        body: carrito({ deliveryMethod: 'delivery', coordinates: PIN }),
      })
      expect(r.body.data.deliveryBand).toBe('far')
      expect(r.body.data.deliveryFee).toBe(far.toFixed(2))
    } finally {
      await db.from('delivery_zones').delete().eq('name', ZONA)
    }
  })

  it('un plato con envío gratis vigente deja el envío en cero y deja el nominal para el tachado', async () => {
    const c = await crearCliente()
    await db
      .from('menu_items')
      .update({ free_delivery_until: '2099-12-31' })
      .eq('id', FIXTURES.ITEM_POLLO_ID)
    try {
      const r = await pedir(postQuote, {
        bearer: c.token,
        method: 'POST',
        body: carrito({ deliveryMethod: 'delivery', coordinates: PIN }),
      })
      const { data } = r.body
      expect(data.freeDelivery).toEqual({ applies: true, reason: 'dish' })
      expect(data.deliveryFee).toBe('0.00')
      expect(Number(data.nominalDeliveryFee)).toBeGreaterThan(0)
      expect(data.total).toBe('96.00')
    } finally {
      await db
        .from('menu_items')
        .update({ free_delivery_until: null })
        .eq('id', FIXTURES.ITEM_POLLO_ID)
    }
  })

  it('el umbral de prepago sale de app_settings y el total lo compara', async () => {
    const c = await crearCliente()
    const { data: previo } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'prepay_threshold')
      .single()
    try {
      await db.from('app_settings').update({ value: 90 }).eq('key', 'prepay_threshold')
      const r = await pedir(postQuote, { bearer: c.token, method: 'POST', body: carrito() })
      expect(r.body.data.prepayThreshold).toBe('90.00')
      expect(r.body.data.exceedsPrepayThreshold).toBe(true) // 96 > 90
    } finally {
      await db
        .from('app_settings')
        .update({ value: previo?.value as never })
        .eq('key', 'prepay_threshold')
    }
  })

  it('un plato que no existe, o de otro negocio: 422', async () => {
    const c = await crearCliente()
    const r = await pedir(postQuote, {
      bearer: c.token,
      method: 'POST',
      body: carrito({ items: [{ menuItemId: crypto.randomUUID(), quantity: 1 }] }),
    })
    expect(r.status).toBe(422)
  })

  it('un negocio que no existe: 404', async () => {
    const c = await crearCliente()
    const r = await pedir(postQuote, {
      bearer: c.token,
      method: 'POST',
      body: carrito({ businessId: crypto.randomUUID() }),
    })
    expect(r.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('/customer/addresses', () => {
  const nueva = (extra: Record<string, unknown> = {}) => ({
    label: 'Casa',
    line: 'Jr. Las Flores 123',
    reference: REF,
    ...extra,
  })

  it('sin sesión: 401', async () => {
    expect((await pedir(getAddresses)).status).toBe(401)
    expect((await pedir(postAddress, { method: 'POST', body: nueva() })).status).toBe(401)
  })

  it('la primera nace predeterminada; la segunda no; pedir isDefault despeja a la anterior', async () => {
    const c = await crearCliente()
    const a = await pedir(postAddress, { bearer: c.token, method: 'POST', body: nueva() })
    expect(a.status).toBe(201)
    expect(a.headers.get('cache-control')).toBe('private, no-store')
    expect(a.body.data).toMatchObject({
      isDefault: true,
      coordinates: null,
      locationConfirmedAt: null,
    })

    const b = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ label: 'Trabajo' }),
    })
    expect(b.body.data.isDefault).toBe(false)
    expect(await defaults(c)).toEqual([a.body.data.id])

    const d = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ label: 'Otro', isDefault: true }),
    })
    expect(d.body.data.isDefault).toBe(true)
    expect(await defaults(c)).toEqual([d.body.data.id])
  })

  it('con punto: lo sella; el mismo punto en una edición conserva el sello; uno nuevo lo renueva', async () => {
    const c = await crearCliente()
    const a = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ coordinates: COURIER_POINT_A, accuracyM: 12 }),
    })
    const { id, locationConfirmedAt } = a.body.data
    expect(locationConfirmedAt).not.toBeNull()
    expect(a.body.data.locationAccuracyM).toBe(12)
    expect(a.body.data.coordinates).toEqual(COURIER_POINT_A)

    // Cambiar la etiqueta no toca el punto ni su sello.
    const renamed = await pedir(patchAddress, {
      bearer: c.token,
      method: 'PATCH',
      params: { id },
      body: { label: 'Trabajo' },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data).toMatchObject({
      label: 'Trabajo',
      locationConfirmedAt,
      locationAccuracyM: 12,
    })
    // El mismo punto reenviado tampoco: se conserva el sello (y la precisión) de antes.
    const same = await pedir(patchAddress, {
      bearer: c.token,
      method: 'PATCH',
      params: { id },
      body: { coordinates: COURIER_POINT_A, accuracyM: 99 },
    })
    expect(same.body.data.locationConfirmedAt).toBe(locationConfirmedAt)
    expect(same.body.data.locationAccuracyM).toBe(12)
    // Un punto distinto se sella de nuevo.
    const moved = await pedir(patchAddress, {
      bearer: c.token,
      method: 'PATCH',
      params: { id },
      body: { coordinates: COURIER_POINT_B, accuracyM: 7 },
    })
    expect(moved.body.data.coordinates).toEqual(COURIER_POINT_B)
    expect(moved.body.data.locationAccuracyM).toBe(7)
    expect(moved.body.data.locationConfirmedAt).not.toBe(locationConfirmedAt)
    // Borrar el punto borra el sello.
    const cleared = await pedir(patchAddress, {
      bearer: c.token,
      method: 'PATCH',
      params: { id },
      body: { coordinates: null },
    })
    expect(cleared.body.data).toMatchObject({
      coordinates: null,
      locationConfirmedAt: null,
      locationAccuracyM: null,
    })
  })

  it('CA-ADR-01 · validación: referencia corta o PATCH vacío son 422', async () => {
    const c = await crearCliente()
    expect(
      (
        await pedir(postAddress, {
          bearer: c.token,
          method: 'POST',
          body: nueva({ reference: 'ab' }),
        })
      ).status,
    ).toBe(422)
    const a = await pedir(postAddress, { bearer: c.token, method: 'POST', body: nueva() })
    expect(
      (
        await pedir(patchAddress, {
          bearer: c.token,
          method: 'PATCH',
          params: { id: a.body.data.id },
          body: {},
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await pedir(patchAddress, {
          bearer: c.token,
          method: 'PATCH',
          params: { id: 'no-es-uuid' },
          body: { label: 'X' },
        })
      ).status,
    ).toBe(422)
  })

  it('marcar la predeterminada en paralelo nunca deja dos (ni ninguna)', async () => {
    const c = await crearCliente()
    const ids: string[] = []
    for (const label of ['Casa', 'Trabajo', 'Otro', 'Mamá']) {
      const r = await pedir(postAddress, {
        bearer: c.token,
        method: 'POST',
        body: nueva({ label }),
      })
      ids.push(r.body.data.id)
    }
    const respuestas = await Promise.all(
      ids.map((id) =>
        pedir(patchAddress, {
          bearer: c.token,
          method: 'PATCH',
          params: { id },
          body: { isDefault: true },
        }),
      ),
    )
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(await defaults(c)).toHaveLength(1)
  })

  it('CA-ADR-05 · borrar la predeterminada pasa el puesto a la más antigua que queda', async () => {
    const c = await crearCliente()
    const a = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ label: 'Casa' }),
    })
    const b = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ label: 'Trabajo' }),
    })
    const d = await pedir(postAddress, {
      bearer: c.token,
      method: 'POST',
      body: nueva({ label: 'Otro' }),
    })
    // Que la predeterminada sea la del medio; la heredera debe ser la más antigua (a).
    await pedir(patchAddress, {
      bearer: c.token,
      method: 'PATCH',
      params: { id: b.body.data.id },
      body: { isDefault: true },
    })
    const del = await pedir(deleteAddress, {
      bearer: c.token,
      method: 'DELETE',
      params: { id: b.body.data.id },
    })
    expect(del.status).toBe(204)
    expect(await defaults(c)).toEqual([a.body.data.id])
    // Y la lista trae la predeterminada primero.
    const lista = await pedir(getAddresses, { bearer: c.token })
    expect(lista.body.data.items.map((i: { id: string }) => i.id)).toEqual([
      a.body.data.id,
      d.body.data.id,
    ])
    // Borrar la última deja la libreta vacía, sin error.
    await pedir(deleteAddress, {
      bearer: c.token,
      method: 'DELETE',
      params: { id: a.body.data.id },
    })
    await pedir(deleteAddress, {
      bearer: c.token,
      method: 'DELETE',
      params: { id: d.body.data.id },
    })
    expect((await pedir(getAddresses, { bearer: c.token })).body.data.items).toEqual([])
  })

  it('CA-ADR-07 · solo del dueño: una dirección ajena no se ve, no se edita y no se borra (404)', async () => {
    const dueno = await crearCliente()
    const otro = await crearCliente()
    const a = await pedir(postAddress, { bearer: dueno.token, method: 'POST', body: nueva() })
    const id = a.body.data.id

    expect((await pedir(getAddresses, { bearer: otro.token })).body.data.items).toEqual([])
    const patch = await pedir(patchAddress, {
      bearer: otro.token,
      method: 'PATCH',
      params: { id },
      body: { label: 'Robada', isDefault: true },
    })
    expect(patch.status).toBe(404)
    const del = await pedir(deleteAddress, { bearer: otro.token, method: 'DELETE', params: { id } })
    expect(del.status).toBe(404)
    // La fila sigue intacta (un DELETE sin permiso también da 204: se verifica con un SELECT).
    const { data } = await db
      .from('customer_addresses')
      .select('label,user_id')
      .eq('id', id)
      .single()
    expect(data).toEqual({ label: 'Casa', user_id: dueno.id })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /customer/orders y /{id}', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir(getOrders)).status).toBe(401)
    expect((await pedir(getOrder, { params: { id: crypto.randomUUID() } })).status).toBe(401)
  })

  it('cliente sin pedidos: lista vacía y sin cursor', async () => {
    const c = await crearCliente()
    const r = await pedir(getOrders, { bearer: c.token })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(r.body.data).toEqual({ items: [], nextCursor: null })
  })

  it('pagina por cursor, del más nuevo al más viejo, sin repetir ni saltar, con sus platos', async () => {
    const c = await crearCliente()
    const creados: string[] = []
    for (let i = 0; i < 3; i++) creados.push(await pedidoCancelado(c))
    // Orden esperado: el último creado primero.
    const esperado = [...creados].reverse()

    const p1 = await pedir(getOrders, { bearer: c.token, qs: '?limit=2' })
    expect(p1.body.data.items.map((o: { id: string }) => o.id)).toEqual(esperado.slice(0, 2))
    expect(p1.body.data.nextCursor).toEqual(expect.any(String))
    const primero = p1.body.data.items[0]
    expect(primero).toMatchObject({
      status: 'cancelled',
      cancelReason: 'proof_rejected_final',
      deliveryMethod: 'delivery',
      businessId: FIXTURES.BUSINESS_ID,
    })
    expect(primero.businessName).toEqual(expect.any(String))
    expect(primero.amount).toMatch(/^\d+\.\d{2}$/)
    expect(primero.total).toMatch(/^\d+\.\d{2}$/)
    expect(primero.items).toEqual([
      { name: FIXTURES.ITEM_POLLO_NAME, quantity: 1, lineTotal: '48.00' },
    ])

    const p2 = await pedir(getOrders, {
      bearer: c.token,
      qs: `?limit=2&cursor=${encodeURIComponent(p1.body.data.nextCursor)}`,
    })
    expect(p2.body.data.items.map((o: { id: string }) => o.id)).toEqual(esperado.slice(2))
    expect(p2.body.data.nextCursor).toBeNull()
  })

  it('el límite tiene techo (50) y un cursor alterado es 422', async () => {
    const c = await crearCliente()
    expect((await pedir(getOrders, { bearer: c.token, qs: '?limit=51' })).status).toBe(422)
    expect((await pedir(getOrders, { bearer: c.token, qs: '?limit=0' })).status).toBe(422)
    const mal = await pedir(getOrders, { bearer: c.token, qs: '?cursor=esto-no-es-un-cursor' })
    expect(mal.status).toBe(422)
    expect(mal.body.code).toBe('validation_error')
  })

  it('cada cliente ve solo sus pedidos', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const idA = await pedidoCancelado(a)
    const lista = await pedir(getOrders, { bearer: b.token })
    expect(lista.body.data.items).toEqual([])
    const detalle = await pedir(getOrder, { bearer: b.token, params: { id: idA } })
    expect(detalle.status).toBe(404)
    // Igual que un id inventado: no confirma que exista.
    const fantasma = await pedir(getOrder, { bearer: b.token, params: { id: crypto.randomUUID() } })
    expect(fantasma.status).toBe(404)
    expect(fantasma.body.code).toBe(detalle.body.code)
  })

  it('el detalle trae notas, dirección, modificadores y el motorizado (su teléfono solo al llegar)', async () => {
    const c = await crearCliente()
    const id = await pedidoCancelado(c, 'Tocar dos veces, portón azul')
    await db.from('orders').update({ driver_id: FIXTURES.DRIVER_ID }).eq('id', id)

    const antes = await pedir(getOrder, { bearer: c.token, params: { id } })
    expect(antes.status).toBe(200)
    expect(antes.headers.get('cache-control')).toBe('private, no-store')
    const { data } = antes.body
    expect(data).toMatchObject({
      id,
      customerNotes: 'Tocar dos veces, portón azul',
      deliveryAddress: 'Jr. Prueba 1',
      deliveryReference: 'Referencia de prueba MV4b',
      deliveryCoordinates: PIN,
      paysWith: null,
      changeToGive: null,
    })
    expect(data.items[0].modifiers).toEqual([
      { group: expect.any(String), name: FIXTURES.MODOPT_QUESO_NAME, price: '3.00' },
    ])
    expect(data.driver).toEqual({ name: expect.any(String), phone: null })
    // No se cuela nada interno.
    const texto = JSON.stringify(data)
    for (const privada of [
      'risk_flags',
      'business_notes',
      'driver_notes',
      'commission',
      'validation',
    ]) {
      expect(texto).not.toContain(privada)
    }

    await db
      .from('orders')
      .update({ arrived_at_customer_at: new Date().toISOString() })
      .eq('id', id)
    const llegado = await pedir(getOrder, { bearer: c.token, params: { id } })
    // CA-TRK-08: ni con el motorizado en la puerta recibe el cliente su teléfono.
    expect(llegado.body.data.driver).toEqual({ name: expect.any(String), phone: null })
    expect(llegado.body.data.pendingAcceptanceAt).toBeDefined()
    expect(llegado.body.data.travelMinutes).toEqual({
      min: expect.any(Number),
      max: expect.any(Number),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /customer/courier-orders', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir(getCourierHistory)).status).toBe(401)
  })

  it('pagina, trae sus contactos frecuentes (solo en la primera página) y no mezcla clientes', async () => {
    const c = await crearCliente()
    const otro = await crearCliente()
    // Tres solicitudes. El tope de activas es por el teléfono verificado (0276), que es el
    // mismo en las tres: las dos primeras se dan por entregadas antes de pedir la siguiente.
    for (let i = 0; i < 3; i++) {
      const { data, error } = await callCreateCourierOrder({
        customerUserId: c.id,
        requesterPhone: telefonoNuevo(),
        origin: COURIER_POINT_A,
        destination: COURIER_POINT_B,
      })
      if (error) throw new Error(`create_courier_order: ${error.message}`)
      if (i < 2) {
        const id = (data as { id: string }).id
        await db.from('courier_orders').update({ status: 'delivered' }).eq('id', id).throwOnError()
      }
    }
    const ajena = await callCreateCourierOrder({
      customerUserId: otro.id,
      requesterPhone: telefonoNuevo(),
    })
    if (ajena.error) throw new Error(ajena.error.message)

    const p1 = await pedir(getCourierHistory, { bearer: c.token, qs: '?limit=2' })
    expect(p1.status).toBe(200)
    expect(p1.headers.get('cache-control')).toBe('private, no-store')
    expect(p1.body.data.items).toHaveLength(2)
    expect(p1.body.data.nextCursor).toEqual(expect.any(String))
    expect(p1.body.data.items[0]).toMatchObject({
      status: 'requested',
      payer: 'destination',
      isFragile: false,
      itemDescription: 'Un paquete de prueba',
      origin: { coordinates: COURIER_POINT_A },
      destination: { coordinates: COURIER_POINT_B },
    })
    expect(p1.body.data.items[0].feeAmount).toMatch(/^\d+\.\d{2}$/)
    // Las 3 usaron los mismos dos sitios: el destino (misma referencia) sube con 3 usos.
    const contactos = p1.body.data.frequentContacts as {
      timesUsed: number
      referenceText: string
    }[]
    expect(contactos.length).toBeGreaterThan(0)
    expect(contactos[0]?.timesUsed).toBe(3)

    const p2 = await pedir(getCourierHistory, {
      bearer: c.token,
      qs: `?limit=2&cursor=${encodeURIComponent(p1.body.data.nextCursor)}`,
    })
    expect(p2.body.data.items).toHaveLength(1)
    expect(p2.body.data.nextCursor).toBeNull()
    expect(p2.body.data.frequentContacts).toEqual([])
    const vistos = [...p1.body.data.items, ...p2.body.data.items].map((i: { id: string }) => i.id)
    expect(new Set(vistos).size).toBe(3)
  })

  it('un cliente sin entregas: vacío', async () => {
    const c = await crearCliente()
    const r = await pedir(getCourierHistory, { bearer: c.token })
    expect(r.body.data).toEqual({ items: [], nextCursor: null, frequentContacts: [] })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /customer/terms-acceptance', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir(postTerms, { method: 'POST', body: { version: '2026-10' } })).status).toBe(
      401,
    )
  })

  it('registra la aceptación (201) y repetirla devuelve la original (200), sin otra fila', async () => {
    const c = await crearCliente()
    const primera = await pedir(postTerms, {
      bearer: c.token,
      method: 'POST',
      body: { version: '2026-10' },
    })
    expect(primera.status).toBe(201)
    expect(primera.headers.get('cache-control')).toBe('private, no-store')
    expect(primera.body.data).toMatchObject({ version: '2026-10', alreadyAccepted: false })

    const segunda = await pedir(postTerms, {
      bearer: c.token,
      method: 'POST',
      body: { version: '2026-10' },
    })
    expect(segunda.status).toBe(200)
    expect(segunda.body.data).toEqual({ ...primera.body.data, alreadyAccepted: true })

    const { count } = await db
      .from('terms_acceptance')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', c.id)
    expect(count).toBe(1)

    // Otra versión es otra aceptación.
    const nueva = await pedir(postTerms, {
      bearer: c.token,
      method: 'POST',
      body: { version: '2026-11' },
    })
    expect(nueva.status).toBe(201)
  })

  it('versión inválida: 422', async () => {
    const c = await crearCliente()
    for (const version of ['', 'una versión con espacios', 'x'.repeat(40)]) {
      expect(
        (await pedir(postTerms, { bearer: c.token, method: 'POST', body: { version } })).status,
      ).toBe(422)
    }
    expect((await pedir(postTerms, { bearer: c.token, method: 'POST', body: {} })).status).toBe(422)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('quote: lo que la creación rechazaría, la cotización también', () => {
  it('un modificador que no es de ese plato: 422', async () => {
    const c = await crearCliente()
    // Extra queso está vinculado al pollo, no al medio pollo.
    const r = await pedir(postQuote, {
      bearer: c.token,
      method: 'POST',
      body: {
        businessId: FIXTURES.BUSINESS_ID,
        deliveryMethod: 'pickup',
        items: [
          {
            menuItemId: FIXTURES.ITEM_MEDIO_ID,
            quantity: 1,
            modifiers: [FIXTURES.MODOPT_QUESO_ID],
          },
        ],
      },
    })
    expect(r.status).toBe(422)
  })

  it('un plato fuera de su franja horaria: 422', async () => {
    const c = await crearCliente()
    // Una franja de un minuto 12 horas después de la hora de Lima: fija a las 03:00, la CI que corría a esa hora
    // encontraba el plato dentro de su franja y la cotización respondía 200.
    const horaLima = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    )
    const hora = String((horaLima + 12) % 24).padStart(2, '0')
    await db
      .from('menu_items')
      .update({ available_from: `${hora}:00`, available_to: `${hora}:01` })
      .eq('id', FIXTURES.ITEM_MEDIO_ID)
    try {
      const r = await pedir(postQuote, {
        bearer: c.token,
        method: 'POST',
        body: {
          businessId: FIXTURES.BUSINESS_ID,
          deliveryMethod: 'pickup',
          items: [{ menuItemId: FIXTURES.ITEM_MEDIO_ID, quantity: 1 }],
        },
      })
      expect(r.status).toBe(422)
      expect(r.body.detail).toContain('turno')
    } finally {
      await db
        .from('menu_items')
        .update({ available_from: null, available_to: null })
        .eq('id', FIXTURES.ITEM_MEDIO_ID)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /customer/checkout/quote · payment', () => {
  // Un plato (48.00): bajo el umbral con o sin envío.
  const bolsa = (extra: Record<string, unknown> = {}) => ({
    businessId: FIXTURES.BUSINESS_ID,
    deliveryMethod: 'delivery',
    items: [
      { menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 1, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
    ],
    ...extra,
  })
  const directorio: string[] = []

  /** Cliente con historial: una fila del directorio para su teléfono lo vuelve de confianza (0171). */
  async function clienteDeConfianza(): Promise<Cliente> {
    const c = await crearCliente()
    const { data, error } = await db
      .from('address_directory')
      .insert({
        phone: c.tel9,
        reference: 'Casa de dos pisos, prueba MV4b',
        source: 'admin_curated',
      })
      .select('id')
      .single()
    if (error) throw new Error(`sembrar el directorio falló: ${error.message}`)
    directorio.push(data.id)
    return c
  }

  afterAll(async () => {
    if (directorio.length > 0) await db.from('address_directory').delete().in('id', directorio)
  })

  const cotizar = async (c: Cliente, extra: Record<string, unknown> = {}) =>
    pedir(postQuote, { bearer: c.token, method: 'POST', body: bolsa(extra) })

  it('cliente de confianza en delivery: solo las dos de al recibir (sin prepaid) y el efectivo declara billete', async () => {
    const c = await clienteDeConfianza()
    const r = await cotizar(c)
    expect(r.status).toBe(200)
    expect(r.body.data.exceedsPrepayThreshold).toBe(false)
    expect(r.body.data.payment.options).toEqual([
      { intent: 'pending_cash', available: true, unavailableReason: null },
      { intent: 'pending_yape', available: true, unavailableReason: null },
    ])
    const { data: ajuste } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'max_cash_bill')
      .single()
    expect(r.body.data.payment.cash).toEqual({
      maxBill: Number(ajuste?.value).toFixed(2),
      maxChange: r.body.data.maxChange,
      step: '0.50',
    })
  })

  it('API-3 · POST con prepaid de un confiable sigue aceptándose (201), aunque la cotización ya no lo ofrezca', async () => {
    const c = await clienteDeConfianza()
    const cot = await cotizar(c)
    expect(cot.body.data.payment.options.map((o: { intent: string }) => o.intent)).not.toContain(
      'prepaid',
    )
    const r = await pedir(postOrder, {
      bearer: c.token,
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        businessId: FIXTURES.BUSINESS_ID,
        deliveryMethod: 'delivery',
        paymentIntent: 'prepaid',
        customerName: NOMBRE,
        customerPhone: c.tel9,
        deliveryAddress: 'Jr. Prueba 1',
        deliveryReference: REF,
        coordinates: PIN,
        items: [
          {
            menuItemId: FIXTURES.ITEM_POLLO_ID,
            quantity: 1,
            modifiers: [FIXTURES.MODOPT_QUESO_ID],
          },
        ],
      },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  /** POST /customer/orders con la misma bolsa de 48.00 que cotiza `bolsa`. */
  const crear = async (
    c: Cliente,
    paymentIntent: 'prepaid' | 'pending_cash' | 'pending_yape',
    extra: Record<string, unknown> = {},
  ) =>
    pedir(postOrder, {
      bearer: c.token,
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        businessId: FIXTURES.BUSINESS_ID,
        deliveryMethod: 'delivery',
        paymentIntent,
        customerName: NOMBRE,
        customerPhone: c.tel9,
        deliveryAddress: 'Jr. Prueba 1',
        deliveryReference: REF,
        coordinates: PIN,
        items: [
          {
            menuItemId: FIXTURES.ITEM_POLLO_ID,
            quantity: 1,
            modifiers: [FIXTURES.MODOPT_QUESO_ID],
          },
        ],
        ...extra,
      },
    })

  const intents = (r: {
    body: { data: { payment: { options: Array<{ intent: string }> } } }
  }): string[] => r.body.data.payment.options.map((o) => o.intent)

  it('cliente sin historial: la cotización conserva las tres opciones (CAX-001, igual que develop)', async () => {
    const c = await crearCliente()
    const r = await cotizar(c)
    expect(r.body.data.payment.options).toEqual([
      { intent: 'pending_cash', available: true, unavailableReason: null },
      { intent: 'pending_yape', available: true, unavailableReason: null },
      { intent: 'prepaid', available: true, unavailableReason: null },
    ])
    expect(r.body.data.payment.cash).not.toBeNull()
  })

  // CAX-001: sin GPS local válido la creación exige prepago; la cotización no puede
  // quitarle esa salida al cliente sin historial.
  describe.each([
    ['GPS ausente', {}],
    ['GPS fallido', { gpsValidation: { method: 'failed' } }],
    [
      'GPS fuera de cobertura',
      { gpsValidation: { method: 'gps_high_accuracy', lat: -9.0, lng: -78.0, accuracyM: 10 } },
    ],
  ])('cliente sin historial · %s', (_nombre, gps) => {
    it('se ofrece prepaid, la contraentrega al recibir se rechaza y prepaid crea el pedido', async () => {
      const c = await crearCliente()
      const cot = await cotizar(c)
      expect(intents(cot)).toContain('prepaid')
      const cash = await crear(c, 'pending_cash', gps)
      expect(cash.status, JSON.stringify(cash.body)).toBe(422)
      expect(cash.body.detail).toContain('Pago adelantado requerido')
      const prepago = await crear(c, 'prepaid', gps)
      expect(prepago.status, JSON.stringify(prepago.body)).toBe(201)
    })
  })

  it('cliente sin historial · GPS local: se ofrece prepaid y la contraentrega entra a `validando`', async () => {
    const c = await crearCliente()
    const cot = await cotizar(c)
    expect(intents(cot)).toContain('prepaid')
    const r = await crear(c, 'pending_cash', {
      gpsValidation: {
        method: 'gps_high_accuracy',
        lat: PIN.lat,
        lng: PIN.lng,
        accuracyM: 10,
      },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.status).toBe('validando')
  })

  // CAX-002: la guardia HTTP de la creación y la cotización calculan el MISMO total
  // (envío gratis, banda cercana o lejana) y coinciden en cada umbral.
  describe('umbral de prepago: cotización y creación coinciden', () => {
    const leerBandas = async (): Promise<{ near: number; far: number }> =>
      (await db.from('app_settings').select('value').eq('key', 'delivery_bands').single()).data
        ?.value as { near: number; far: number }

    async function conUmbral(umbral: number, fn: () => Promise<void>): Promise<void> {
      const { data: previo } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'prepay_threshold')
        .single()
      await db.from('app_settings').update({ value: umbral }).eq('key', 'prepay_threshold')
      try {
        await fn()
      } finally {
        await db
          .from('app_settings')
          .update({ value: previo?.value as never })
          .eq('key', 'prepay_threshold')
      }
    }

    /** Total que quedó guardado en el pedido (subtotal + envío), en céntimos. */
    async function totalDelPedido(orderId: string): Promise<number> {
      const { data } = await db
        .from('orders')
        .select('order_amount,delivery_fee')
        .eq('id', orderId)
        .single()
      return Math.round((Number(data?.order_amount) + Number(data?.delivery_fee)) * 100)
    }

    /** `cuenta` = total en céntimos de la cotización; igualdad pasa, un céntimo menos de umbral no. */
    async function verificar(cuenta: number, etiqueta: string): Promise<void> {
      const c1 = await clienteDeConfianza()
      await conUmbral(cuenta / 100, async () => {
        const cot = await cotizar(c1, { coordinates: PIN })
        expect(cot.body.data.total, etiqueta).toBe((cuenta / 100).toFixed(2))
        expect(cot.body.data.exceedsPrepayThreshold, etiqueta).toBe(false)
        const r = await crear(c1, 'pending_cash')
        expect(r.status, `${etiqueta} igualdad: ${JSON.stringify(r.body)}`).toBe(201)
        expect(await totalDelPedido(r.body.data.id), etiqueta).toBe(cuenta)
      })
      const c2 = await clienteDeConfianza()
      await conUmbral((cuenta - 1) / 100, async () => {
        const cot = await cotizar(c2, { coordinates: PIN })
        expect(cot.body.data.exceedsPrepayThreshold, etiqueta).toBe(true)
        expect(intents(cot), etiqueta).toEqual(['pending_cash', 'pending_yape', 'prepaid'])
        const r = await crear(c2, 'pending_cash')
        // La guardia HTTP (403), no la RPC (422): con todo leído, corta ella.
        expect(r.status, `${etiqueta} +1 céntimo: ${JSON.stringify(r.body)}`).toBe(403)
        expect(r.body.detail, etiqueta).toContain(`(S/ ${(cuenta / 100).toFixed(2)}) pasa de`)
        const prepago = await crear(c2, 'prepaid')
        expect(prepago.status, JSON.stringify(prepago.body)).toBe(201)
      })
    }

    it('plato de 48.00 con envío gratis: total 48.00; umbral 49.00 deja pasar la contraentrega', async () => {
      await db
        .from('menu_items')
        .update({ free_delivery_until: '2099-12-31' })
        .eq('id', FIXTURES.ITEM_POLLO_ID)
      try {
        const c = await clienteDeConfianza()
        await conUmbral(49, async () => {
          const cot = await cotizar(c, { coordinates: PIN })
          expect(cot.body.data.freeDelivery).toEqual({ applies: true, reason: 'dish' })
          expect(cot.body.data.total).toBe('48.00')
          expect(cot.body.data.exceedsPrepayThreshold).toBe(false)
          const r = await crear(c, 'pending_cash')
          expect(r.status, JSON.stringify(r.body)).toBe(201)
        })
        await verificar(4800, 'envío gratis')
      } finally {
        await db
          .from('menu_items')
          .update({ free_delivery_until: null })
          .eq('id', FIXTURES.ITEM_POLLO_ID)
      }
    })

    it('banda cercana sin promoción: igualdad al umbral y un céntimo por encima', async () => {
      const { near } = await leerBandas()
      await verificar(4800 + Math.round(near * 100), 'banda cercana')
    })

    it('banda lejana: igualdad al umbral y un céntimo por encima', async () => {
      const { far } = await leerBandas()
      const { error } = await db.from('delivery_zones').insert({
        name: ZONA,
        polygon: [
          { lat: PIN.lat - 0.004, lng: PIN.lng - 0.004 },
          { lat: PIN.lat - 0.004, lng: PIN.lng + 0.004 },
          { lat: PIN.lat + 0.004, lng: PIN.lng + 0.004 },
          { lat: PIN.lat + 0.004, lng: PIN.lng - 0.004 },
        ],
      })
      if (error) throw new Error(error.message)
      try {
        await verificar(4800 + Math.round(far * 100), 'banda lejana')
      } finally {
        await db.from('delivery_zones').delete().eq('name', ZONA)
      }
    })

    // CAX-002 (R2): si falla CUALQUIER lectura del cálculo, la guardia HTTP no corta y
    // decide la RPC (422 si el total pasa del umbral, 201 si no). Sin el fallo, corta
    // la guardia con 403. Ejemplo de Codex: plato de 48.00, banda cercana 2.00, tarifa
    // del negocio 3.00 y umbral 50.00 (total real 50.00, que la RPC acepta).
    describe('lecturas fallidas: la guardia no corta y decide la RPC', () => {
      interface Fallo {
        reads?: Array<{ table: string; select?: string; eq?: [string, unknown] }>
        rpcs?: string[]
      }
      const BANDAS = { table: 'app_settings', eq: ['key', 'delivery_bands'] as [string, unknown] }
      const TARIFA_NEGOCIO = { table: 'businesses', select: 'delivery_fee' }
      const PROMO = 'current_customer_promo_free_delivery'
      const PLATO = 'cart_item_free_delivery'
      let tarifaPrevia: unknown = null

      beforeAll(async () => {
        const { data } = await db
          .from('businesses')
          .select('delivery_fee')
          .eq('id', FIXTURES.BUSINESS_ID)
          .single()
        tarifaPrevia = data?.delivery_fee ?? null
        await db.from('businesses').update({ delivery_fee: 3 }).eq('id', FIXTURES.BUSINESS_ID)
      })
      afterAll(async () => {
        await db
          .from('businesses')
          .update({ delivery_fee: tarifaPrevia as never })
          .eq('id', FIXTURES.BUSINESS_ID)
        faults.state.reads = []
        faults.state.rpcs = []
      })

      /** Crea con `pending_cash` con el fallo puesto SOLO durante el POST (la cotización va limpia). */
      async function crearConFallo(
        umbral: number,
        fallo: Fallo,
        carrito: Record<string, unknown> = {},
      ) {
        const c = await clienteDeConfianza()
        let r: Awaited<ReturnType<typeof crear>> | undefined
        await conUmbral(umbral, async () => {
          const cot = await cotizar(c, { coordinates: PIN, ...carrito })
          expect(cot.status).toBe(200)
          faults.state.reads = fallo.reads ?? []
          faults.state.rpcs = fallo.rpcs ?? []
          try {
            r = await crear(c, 'pending_cash', carrito)
          } finally {
            faults.state.reads = []
            faults.state.rpcs = []
          }
        })
        if (!r) throw new Error('sin respuesta')
        return r
      }

      const sinDescuento: Array<[string, Fallo]> = [
        ['tarifas por banda', { reads: [BANDAS] }],
        ['tarifa del negocio', { reads: [TARIFA_NEGOCIO] }],
        ['promoción de lanzamiento', { rpcs: [PROMO] }],
        ['envío gratis por plato', { rpcs: [PLATO] }],
      ]

      it.each(
        sinDescuento,
      )('falla %s, sin descuento real: total real 50.00, umbral 50.00 -> 201 (la guardia no corta)', async (_n, fallo) => {
        const r = await crearConFallo(50, fallo)
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(await totalDelPedido(r.body.data.id)).toBe(5000)
      })

      it.each(
        sinDescuento,
      )('falla %s, sin descuento real: total real 50.00, umbral 49.99 -> 422 de la RPC, no 403', async (_n, fallo) => {
        const r = await crearConFallo(49.99, fallo)
        expect(r.status, JSON.stringify(r.body)).toBe(422)
        // El texto lo pone la RPC con SU total: 50.00 y el umbral 49.99.
        expect(r.body.detail).toContain('(S/ 50.00) pasa de S/ 49.99')
      })

      it('falla la lectura del umbral (respaldo 80): umbral real 100, dos platos (98.00) -> 201, no 403', async () => {
        const dos = {
          items: [
            {
              menuItemId: FIXTURES.ITEM_POLLO_ID,
              quantity: 2,
              modifiers: [FIXTURES.MODOPT_QUESO_ID],
            },
          ],
        }
        const r = await crearConFallo(
          100,
          { reads: [{ table: 'app_settings', eq: ['key', 'prepay_threshold'] }] },
          dos,
        )
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(await totalDelPedido(r.body.data.id)).toBe(9800)
      })

      it('falla la banda del punto en la creación (zona lejana, umbral 49.99): 422 de la RPC, no 500 ni 403', async () => {
        const { error } = await db.from('delivery_zones').insert({
          name: ZONA,
          polygon: [
            { lat: PIN.lat - 0.004, lng: PIN.lng - 0.004 },
            { lat: PIN.lat - 0.004, lng: PIN.lng + 0.004 },
            { lat: PIN.lat + 0.004, lng: PIN.lng + 0.004 },
            { lat: PIN.lat + 0.004, lng: PIN.lng - 0.004 },
          ],
        })
        if (error) throw new Error(error.message)
        try {
          const r = await crearConFallo(49.99, { rpcs: ['delivery_band_for_point'] })
          expect(r.status, JSON.stringify(r.body)).toBe(422)
          // La RPC sí ve la zona lejana: 48.00 + 2.50.
          expect(r.body.detail).toContain('(S/ 50.50) pasa de S/ 49.99')
        } finally {
          await db.from('delivery_zones').delete().eq('name', ZONA)
        }
      })

      it('control: sin fallo, total 50.00 y umbral 49.99 -> 403 de la guardia', async () => {
        const r = await crearConFallo(49.99, {})
        expect(r.status, JSON.stringify(r.body)).toBe(403)
        expect(r.body.detail).toContain('(S/ 50.00) pasa de')
      })

      describe('con descuento real por plato (total real 48.00)', () => {
        const gratis = async (fn: () => Promise<void>) => {
          await db
            .from('menu_items')
            .update({ free_delivery_until: '2099-12-31' })
            .eq('id', FIXTURES.ITEM_POLLO_ID)
          try {
            await fn()
          } finally {
            await db
              .from('menu_items')
              .update({ free_delivery_until: null })
              .eq('id', FIXTURES.ITEM_POLLO_ID)
          }
        }

        const todos: Array<[string, Fallo]> = [
          ['promoción de lanzamiento', { rpcs: [PROMO] }],
          ['envío gratis por plato', { rpcs: [PLATO] }],
          ['tarifas por banda', { reads: [BANDAS] }],
          ['tarifa del negocio', { reads: [TARIFA_NEGOCIO] }],
        ]

        it.each(
          todos,
        )('falla %s: umbral 48.00 -> 201 y el pedido queda en 48.00', async (_n, fallo) => {
          await gratis(async () => {
            const r = await crearConFallo(48, fallo)
            expect(r.status, JSON.stringify(r.body)).toBe(201)
            expect(await totalDelPedido(r.body.data.id)).toBe(4800)
          })
        })

        it.each(
          todos.slice(0, 2),
        )('falla %s: umbral 47.99 -> 422 de la RPC, no 403', async (_n, fallo) => {
          await gratis(async () => {
            const r = await crearConFallo(47.99, fallo)
            expect(r.status, JSON.stringify(r.body)).toBe(422)
            expect(r.body.detail).toContain('(S/ 48.00) pasa de S/ 47.99')
          })
        })

        it('control: sin fallo, umbral 47.99 -> 403 de la guardia', async () => {
          await gratis(async () => {
            const r = await crearConFallo(47.99, {})
            expect(r.status, JSON.stringify(r.body)).toBe(403)
            expect(r.body.detail).toContain('(S/ 48.00) pasa de')
          })
        })
      })

      describe('promoción de lanzamiento real (0187)', () => {
        const CODIGO = 'mv4b-lanzamiento-test'
        let previa: unknown = null
        let habia = false

        beforeAll(async () => {
          const { data } = await db
            .from('app_settings')
            .select('value')
            .eq('key', 'promo_free_delivery')
            .maybeSingle()
          habia = data !== null
          previa = data?.value ?? null
          await db.from('app_settings').upsert(
            {
              key: 'promo_free_delivery',
              value: {
                code: CODIGO,
                active: true,
                from: '2000-01-01',
                to: '2099-12-31',
                max_redemptions: 100,
              },
            },
            { onConflict: 'key' },
          )
        })
        afterAll(async () => {
          await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
          if (habia) {
            await db
              .from('app_settings')
              .update({ value: previa as never })
              .eq('key', 'promo_free_delivery')
          } else {
            await db.from('app_settings').delete().eq('key', 'promo_free_delivery')
          }
        })

        it('la cotización la aplica y la guardia deja pasar el total ya sin envío (umbral 48.00 -> 201)', async () => {
          const c = await clienteDeConfianza()
          await conUmbral(48, async () => {
            const cot = await cotizar(c, { coordinates: PIN })
            expect(cot.body.data.freeDelivery).toEqual({ applies: true, reason: 'launch_promo' })
            expect(cot.body.data.total).toBe('48.00')
            const r = await crear(c, 'pending_cash')
            expect(r.status, JSON.stringify(r.body)).toBe(201)
            expect(await totalDelPedido(r.body.data.id)).toBe(4800)
          })
        })

        it('sin fallo, umbral 47.99 -> 403 de la guardia; con la promoción caída -> 422 de la RPC', async () => {
          const c1 = await clienteDeConfianza()
          await conUmbral(47.99, async () => {
            const r = await crear(c1, 'pending_cash')
            expect(r.status, JSON.stringify(r.body)).toBe(403)
            expect(r.body.detail).toContain('(S/ 48.00) pasa de')
          })
          const c2 = await clienteDeConfianza()
          await conUmbral(47.99, async () => {
            faults.state.rpcs = [PROMO]
            try {
              const r = await crear(c2, 'pending_cash')
              expect(r.status, JSON.stringify(r.body)).toBe(422)
              expect(r.body.detail).toContain('(S/ 48.00) pasa de S/ 47.99')
            } finally {
              faults.state.rpcs = []
            }
          })
        })
      })
    })

    // CAX-004 (0295): una promoción de lanzamiento activa, con código y cupo, pero sin la ventana
    // completa (`from` o `to` ausentes o null) NO es elegible: la creación no la aplica (0283:377),
    // así que la cotización no puede anunciarla. Ejemplo de Codex: plato de 48.00, envío 2.00 y
    // umbral 49.00 (total real 50.00).
    describe('promoción de lanzamiento sin ventana completa (0295)', () => {
      const CODIGO = 'mv4b-ventana-test'
      const base = { code: CODIGO, active: true, max_redemptions: 100 }
      let previa: unknown = null
      let habia = false

      beforeAll(async () => {
        const { data } = await db
          .from('app_settings')
          .select('value')
          .eq('key', 'promo_free_delivery')
          .maybeSingle()
        habia = data !== null
        previa = data?.value ?? null
      })
      afterAll(async () => {
        await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
        if (habia) {
          await db
            .from('app_settings')
            .update({ value: previa as never })
            .eq('key', 'promo_free_delivery')
        } else {
          await db.from('app_settings').delete().eq('key', 'promo_free_delivery')
        }
      })

      /** La RPC tal como la llama la cotización: con el JWT del cliente (responde por `auth.uid()`). */
      const rpcPromo = async (c: Cliente) => {
        const comoCliente = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${c.token}` } },
        })
        const { data, error } = await comoCliente.rpc('current_customer_promo_free_delivery')
        if (error) throw new Error(error.message)
        return data
      }

      const configurar = async (value: Record<string, unknown>) => {
        const { error } = await db
          .from('app_settings')
          .upsert({ key: 'promo_free_delivery', value }, { onConflict: 'key' })
        if (error) throw new Error(error.message)
      }

      it.each([
        ['from y to ausentes', {}],
        ['from null', { from: null, to: '2099-12-31' }],
        ['to null', { from: '2000-01-01', to: null }],
        ['from y to null', { from: null, to: null }],
        ['solo from ausente', { to: '2099-12-31' }],
        ['solo to ausente', { from: '2000-01-01' }],
      ])('%s: no se anuncia envío gratis y cotización y creación coinciden (48.00 + 2.00)', async (_n, ventana) => {
        await configurar({ ...base, ...ventana })
        const c = await clienteDeConfianza()
        // La RPC misma: sin ventana completa no es elegible (0295), con el motivo y sin código.
        expect(await rpcPromo(c)).toEqual({ eligible: false, reason: 'inactive', code: null })
        await conUmbral(49, async () => {
          const cot = await cotizar(c, { coordinates: PIN })
          expect(cot.body.data.freeDelivery).toEqual({ applies: false, reason: null })
          expect(cot.body.data.deliveryFee).toBe('2.00')
          expect(cot.body.data.total).toBe('50.00')
          expect(cot.body.data.exceedsPrepayThreshold).toBe(true)
          // Sin opción al recibir disponible, el trusted conserva prepaid.
          expect(cot.body.data.payment.options).toEqual([
            { intent: 'pending_cash', available: false, unavailableReason: 'exceeds_threshold' },
            { intent: 'pending_yape', available: false, unavailableReason: 'exceeds_threshold' },
            { intent: 'prepaid', available: true, unavailableReason: null },
          ])
          // La creación calcula lo mismo: la guardia corta con el total real...
          const cash = await crear(c, 'pending_cash')
          expect(cash.status, JSON.stringify(cash.body)).toBe(403)
          expect(cash.body.detail).toContain('(S/ 50.00) pasa de')
          const yape = await crear(c, 'pending_yape')
          expect(yape.status, JSON.stringify(yape.body)).toBe(403)
          expect(yape.body.detail).toContain('(S/ 50.00) pasa de')
          // ...y el prepago, la única opción ofrecida, crea el pedido por 50.00.
          const prepago = await crear(c, 'prepaid')
          expect(prepago.status, JSON.stringify(prepago.body)).toBe(201)
          expect(await totalDelPedido(prepago.body.data.id)).toBe(5000)
        })
      })

      it('from mayor que to (ventana completa pero imposible): outside_window, sin descuento y el prepago crea por 50.00', async () => {
        await configurar({ ...base, from: '2099-01-01', to: '2000-01-01' })
        const c = await clienteDeConfianza()
        expect(await rpcPromo(c)).toEqual({
          eligible: false,
          reason: 'outside_window',
          code: CODIGO,
        })
        await conUmbral(49, async () => {
          const cot = await cotizar(c, { coordinates: PIN })
          expect(cot.body.data.freeDelivery).toEqual({ applies: false, reason: null })
          expect(cot.body.data.total).toBe('50.00')
          const cash = await crear(c, 'pending_cash')
          expect(cash.status, JSON.stringify(cash.body)).toBe(403)
          const prepago = await crear(c, 'prepaid')
          expect(prepago.status, JSON.stringify(prepago.body)).toBe(201)
          expect(await totalDelPedido(prepago.body.data.id)).toBe(5000)
        })
      })

      it('control, ventana completa y vigente: se anuncia el envío gratis y la contraentrega pasa (48.00)', async () => {
        await configurar({ ...base, from: '2000-01-01', to: '2099-12-31' })
        const c = await clienteDeConfianza()
        expect(await rpcPromo(c)).toEqual({ eligible: true, reason: 'active', code: CODIGO })
        await conUmbral(49, async () => {
          const cot = await cotizar(c, { coordinates: PIN })
          expect(cot.body.data.freeDelivery).toEqual({ applies: true, reason: 'launch_promo' })
          expect(cot.body.data.total).toBe('48.00')
          expect(intents(cot)).toEqual(['pending_cash', 'pending_yape'])
          const r = await crear(c, 'pending_cash')
          expect(r.status, JSON.stringify(r.body)).toBe(201)
          expect(await totalDelPedido(r.body.data.id)).toBe(4800)
        })
      })

      it('control, ventana completa pero vencida: la RPC dice outside_window, no se anuncia y el total es 50.00', async () => {
        await configurar({ ...base, from: '2000-01-01', to: '2001-01-01' })
        const c = await clienteDeConfianza()
        expect(await rpcPromo(c)).toEqual({
          eligible: false,
          reason: 'outside_window',
          code: CODIGO,
        })
        await conUmbral(49, async () => {
          const cot = await cotizar(c, { coordinates: PIN })
          expect(cot.body.data.freeDelivery).toEqual({ applies: false, reason: null })
          expect(cot.body.data.total).toBe('50.00')
        })
      })
    })
  })

  it('cuenta con contraentrega bloqueada (risk_blocked): prepay_required y cash null', async () => {
    const c = await clienteDeConfianza() // el riesgo manda sobre el historial
    const { error } = await db
      .from('customer_profiles')
      .update({ contraentrega_blocked: true })
      .eq('user_id', c.id)
    if (error) throw new Error(error.message)
    const r = await cotizar(c)
    expect(r.body.data.payment.options).toEqual([
      { intent: 'pending_cash', available: false, unavailableReason: 'prepay_required' },
      { intent: 'pending_yape', available: false, unavailableReason: 'prepay_required' },
      { intent: 'prepaid', available: true, unavailableReason: null },
    ])
    expect(r.body.data.payment.cash).toBeNull()
  })

  it('total sobre el umbral: exceeds_threshold', async () => {
    const c = await clienteDeConfianza()
    const r = await cotizar(c, {
      items: [
        { menuItemId: FIXTURES.ITEM_POLLO_ID, quantity: 2, modifiers: [FIXTURES.MODOPT_QUESO_ID] },
      ],
    })
    expect(r.body.data.exceedsPrepayThreshold).toBe(true)
    expect(r.body.data.payment.options[0]).toEqual({
      intent: 'pending_cash',
      available: false,
      unavailableReason: 'exceeds_threshold',
    })
    expect(r.body.data.payment.cash).toBeNull()
  })

  it('0283 · recojo, ahora o más tarde: solo prepaid, sin caja ni pending_yape ni billete', async () => {
    const c = await clienteDeConfianza()
    for (const extra of [{ pickupTiming: 'later' }, { pickupTiming: 'now' }]) {
      const r = await cotizar(c, { deliveryMethod: 'pickup', ...extra })
      expect(r.status).toBe(200)
      expect(r.body.data.payment.options).toEqual([
        { intent: 'prepaid', available: true, unavailableReason: null },
      ])
      expect(r.body.data.payment.cash).toBeNull()
    }
  })

  it('0283 · recojo sin pickupTiming: también solo prepaid (trusted y no_history)', async () => {
    for (const c of [await clienteDeConfianza(), await crearCliente()]) {
      const r = await cotizar(c, { deliveryMethod: 'pickup' })
      expect(r.status).toBe(200)
      expect(r.body.data.payment.options).toEqual([
        { intent: 'prepaid', available: true, unavailableReason: null },
      ])
      expect(r.body.data.payment.cash).toBeNull()
    }
  })

  it('una petición antigua de delivery, sin pickupTiming, sigue aceptada', async () => {
    const c = await crearCliente()
    const r = await cotizar(c)
    expect(r.status).toBe(200)
    expect(r.body.data.payment.options[0].available).toBe(true)
  })

  it('ajustes reales menores que los respaldos: umbral y billete salen de app_settings', async () => {
    const c = await clienteDeConfianza()
    const leer = async (key: string) =>
      (await db.from('app_settings').select('value').eq('key', key).single()).data?.value
    const previoUmbral = await leer('prepay_threshold')
    const previoBillete = await leer('max_cash_bill')
    try {
      await db.from('app_settings').update({ value: 40 }).eq('key', 'prepay_threshold')
      await db.from('app_settings').update({ value: 50 }).eq('key', 'max_cash_bill')
      // Un plato de 48.00 pasa de 40 pero no del respaldo de 80.
      const alto = await cotizar(c)
      expect(alto.body.data.exceedsPrepayThreshold).toBe(true)
      expect(alto.body.data.payment.options[0]).toEqual({
        intent: 'pending_cash',
        available: false,
        unavailableReason: 'exceeds_threshold',
      })
      await db.from('app_settings').update({ value: 80 }).eq('key', 'prepay_threshold')
      const bajo = await cotizar(c)
      expect(bajo.body.data.payment.cash.maxBill).toBe('50.00')
    } finally {
      await db
        .from('app_settings')
        .update({ value: previoUmbral as never })
        .eq('key', 'prepay_threshold')
      await db
        .from('app_settings')
        .update({ value: previoBillete as never })
        .eq('key', 'max_cash_bill')
    }
  })

  it('pickupTiming con delivery: 422', async () => {
    const c = await crearCliente()
    const r = await cotizar(c, { pickupTiming: 'now' })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('validation_error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('un usuario multirol no ve datos de otro cliente', () => {
  it('cliente+admin pide pedido, direcciones y Entregas de OTRO cliente: 404 / sin sus datos', async () => {
    const victima = await crearCliente()
    const multi = await crearCliente() // 'Vecino MV4b': lo barre el globalSetup con sus roles
    const { error } = await db.from('user_roles').insert({ user_id: multi.id, role: 'admin' })
    if (error) throw new Error(`rol admin: ${error.message}`)

    const idPedido = await pedidoCancelado(victima)
    const dir = await pedir(postAddress, {
      bearer: victima.token,
      method: 'POST',
      body: { label: 'Casa', line: 'Jr. Ajena 1', reference: REF },
    })
    const ce = await callCreateCourierOrder({
      customerUserId: victima.id,
      requesterPhone: telefonoNuevo(),
    })
    if (ce.error) throw new Error(ce.error.message)

    // La RLS de admin SÍ le dejaría leer estas filas: lo impide el filtro de dueño.
    const detalle = await pedir(getOrder, { bearer: multi.token, params: { id: idPedido } })
    expect(detalle.status).toBe(404)
    expect((await pedir(getOrders, { bearer: multi.token })).body.data.items).toEqual([])
    expect((await pedir(getAddresses, { bearer: multi.token })).body.data.items).toEqual([])
    const entregas = await pedir(getCourierHistory, { bearer: multi.token })
    expect(entregas.body.data).toEqual({ items: [], nextCursor: null, frequentContacts: [] })
    const id = dir.body.data.id
    const patch = await pedir(patchAddress, {
      bearer: multi.token,
      method: 'PATCH',
      params: { id },
      body: { label: 'X' },
    })
    expect(patch.status).toBe(404)
    const del = await pedir(deleteAddress, {
      bearer: multi.token,
      method: 'DELETE',
      params: { id },
    })
    expect(del.status).toBe(404)
    const { data } = await db.from('customer_addresses').select('label').eq('id', id).single()
    expect(data?.label).toBe('Casa')
  })
})
