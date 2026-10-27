/**
 * Reseñas por la API (0280): el pendiente, calificar y descartar, contra la base local.
 * La web sigue usando sus RPC (`get_pending_review`, `create_order_review`) y las funciones
 * `*_for` no se pueden llamar con la sesión de un usuario.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { POST as postDismiss } from '../../app/api/v1/customer/orders/[id]/review/dismiss/route'
import { POST as postReview } from '../../app/api/v1/customer/orders/[id]/review/route'
import { GET as getPending } from '../../app/api/v1/customer/reviews/pending/route'
import {
  cleanup,
  localClient as db,
  E2E,
  type SeededOrder,
  seedContraentregaOrder,
} from './helpers/local-db'
import { callCreateCourierOrder, patchCourierSettings } from './helpers/local-db-courier'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const PASSWORD = 'test-password-12345'
const DAY_MS = 86_400_000

interface Persona {
  id: string
  email: string
  token: string
}

let dueno: Persona
let ajeno: Persona
let sinRol: Persona
const authIds: string[] = []
const seeds: SeededOrder[] = []
let courierSettings: unknown = null

async function signIn(email: string): Promise<string> {
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error('No se pudo iniciar la sesión de prueba')
  return data.session.access_token
}

async function crearPersona(conRol: boolean): Promise<Persona> {
  const email = `resenas-${crypto.randomUUID()}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Reseñas' },
  })
  if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`)
  const id = data.user.id
  authIds.push(id)
  if (conRol) {
    const phone = `+519${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
    await db
      .from('customer_profiles')
      .insert({
        user_id: id,
        full_name: 'Vecino Reseñas',
        phone,
        phone_verified_at: new Date().toISOString(),
      })
      .throwOnError()
  } else {
    await db.from('user_roles').delete().eq('user_id', id).throwOnError()
    await db.from('user_roles').insert({ user_id: id, role: 'driver' }).throwOnError()
  }
  return { id, email, token: await signIn(email) }
}

async function phoneOf(p: Persona): Promise<string> {
  const { data } = await db
    .from('customer_profiles')
    .select('phone')
    .eq('user_id', p.id)
    .single()
    .throwOnError()
  return data.phone as string
}

beforeAll(async () => {
  dueno = await crearPersona(true)
  ajeno = await crearPersona(true)
  sinRol = await crearPersona(false)
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  courierSettings = data?.value ?? null
})

afterEach(async () => {
  await db.from('courier_orders').delete().in('customer_user_id', [dueno.id, ajeno.id])
  for (const seed of seeds.splice(0)) {
    await db.from('order_event_log').delete().eq('order_id', seed.orderId)
    await db.from('order_reviews').delete().eq('order_id', seed.orderId)
    await db.from('order_review_dismissals').delete().eq('order_id', seed.orderId)
    await cleanup(seed)
  }
})

afterAll(async () => {
  for (const id of authIds) {
    await db.from('customer_profiles').delete().eq('user_id', id)
    await db.from('user_roles').delete().eq('user_id', id)
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
  if (courierSettings) {
    await db
      .from('app_settings')
      .update({ value: courierSettings as never })
      .eq('key', 'courier')
  }
})

interface PedidoOpts {
  de?: Persona
  /** `null` = sin entregar (queda en `waiting_driver`). */
  entregadoHace?: number | null
}

/** Un pedido de restaurante de `de` (el dueño por defecto), entregado hace N días. */
async function pedido(opts: PedidoOpts = {}): Promise<string> {
  const { de = dueno, entregadoHace = 1 } = opts
  const seed = await seedContraentregaOrder()
  seeds.push(seed)
  const cambios: Record<string, unknown> = { customer_user_id: de.id }
  if (entregadoHace !== null) {
    cambios.driver_id = E2E.DRIVER_ID
    cambios.status = 'delivered'
    cambios.delivered_at = new Date(Date.now() - entregadoHace * DAY_MS).toISOString()
  }
  await db.from('orders').update(cambios).eq('id', seed.orderId).throwOnError()
  return seed.orderId
}

const headers = (token: string | null, json = false): HeadersInit => ({
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...(json ? { 'content-type': 'application/json' } : {}),
})

function pendiente(token: string | null = dueno.token) {
  return getPending(
    new Request('http://localhost:3001/api/v1/customer/reviews/pending', {
      headers: headers(token),
    }),
    { params: Promise.resolve({}) },
  )
}

function calificar(id: string, cuerpo: unknown, token: string | null = dueno.token) {
  return postReview(
    new Request(`http://localhost:3001/api/v1/customer/orders/${id}/review`, {
      method: 'POST',
      headers: headers(token, true),
      body: JSON.stringify(cuerpo),
    }),
    { params: Promise.resolve({ id }) },
  )
}

function descartar(id: string, token: string | null = dueno.token) {
  return postDismiss(
    new Request(`http://localhost:3001/api/v1/customer/orders/${id}/review/dismiss`, {
      method: 'POST',
      headers: headers(token),
    }),
    { params: Promise.resolve({ id }) },
  )
}

interface Pending {
  orderId: string
  shortId: string
  deliveredAt: string
  closesAt: string
  tags: { id: string; label: string }[]
}

async function leerPendiente(token: string | null = dueno.token): Promise<Pending | null> {
  const res = await pendiente(token)
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: Pending | null }).data
}

interface Problema {
  status: number
  code: string
  detail?: string
  requestId?: string
  instance?: string
}

/** El cuerpo de un error sin lo que cambia en cada llamada. */
async function errorSinIds(res: Response, status: number): Promise<Record<string, unknown>> {
  expect(res.status).toBe(status)
  const { requestId: _requestId, instance: _instance, ...resto } = (await res.json()) as Problema
  return resto
}

async function usuario(p: Persona) {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: p.email, password: PASSWORD })
  if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`)
  return client
}

describe('GET /customer/reviews/pending', () => {
  it('sin sesión: 401', async () => {
    expect((await pendiente(null)).status).toBe(401)
  })

  it('una sesión sin el rol de cliente: 403', async () => {
    expect((await pendiente(sinRol.token)).status).toBe(403)
  })

  it('sin nada pendiente: 200 con data null', async () => {
    const res = await pendiente()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: null })
  })

  it('devuelve el entregado más reciente dentro de la ventana', async () => {
    await pedido({ entregadoHace: 5 })
    const reciente = await pedido({ entregadoHace: 1 })
    await pedido({ entregadoHace: 3 })
    expect((await leerPendiente())?.orderId).toBe(reciente)
  })

  it('excluye el ya calificado', async () => {
    const calificado = await pedido({ entregadoHace: 1 })
    const otro = await pedido({ entregadoHace: 4 })
    expect((await calificar(calificado, { rating: 5 })).status).toBe(200)
    expect((await leerPendiente())?.orderId).toBe(otro)
  })

  it('excluye el descartado', async () => {
    const descartado = await pedido({ entregadoHace: 1 })
    const otro = await pedido({ entregadoHace: 4 })
    expect((await descartar(descartado)).status).toBe(204)
    expect((await leerPendiente())?.orderId).toBe(otro)
  })

  it('excluye el que está fuera de la ventana', async () => {
    await pedido({ entregadoHace: 22 })
    expect(await leerPendiente()).toBeNull()
  })

  it('excluye el que no está entregado', async () => {
    await pedido({ entregadoHace: null })
    expect(await leerPendiente()).toBeNull()
  })

  it('excluye el pedido de otro cliente', async () => {
    await pedido({ de: ajeno, entregadoHace: 1 })
    expect(await leerPendiente()).toBeNull()
  })

  it('trae las etiquetas del catálogo y las fechas en UTC con la ventana de 21 días', async () => {
    const id = await pedido({ entregadoHace: 2 })
    const data = await leerPendiente()
    expect(data?.orderId).toBe(id)
    expect(data?.tags.map((t) => t.id)).toEqual(
      expect.arrayContaining(['todo_bien', 'buen_trato', 'demoro', 'llego_fria', 'falto_algo']),
    )
    expect(data?.deliveredAt.endsWith('Z')).toBe(true)
    expect(data?.closesAt.endsWith('Z')).toBe(true)
    const entregado = new Date(data?.deliveredAt ?? '').getTime()
    const cierra = new Date(data?.closesAt ?? '').getTime()
    expect(cierra - entregado).toBe(21 * DAY_MS)
  })
})

describe('POST /customer/orders/{id}/review', () => {
  it('califica un pedido propio, entregado y en plazo: 200 con id, orderId y rating', async () => {
    const id = await pedido()
    const res = await calificar(id, { rating: 4, tags: ['todo_bien'] })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as { data: { id: string; orderId: string; rating: number } })
      .data
    expect(data).toEqual({ id: expect.any(String), orderId: id, rating: 4 })
    const { data: fila } = await db
      .from('order_reviews')
      .select('id, customer_user_id')
      .eq('order_id', id)
      .single()
      .throwOnError()
    expect(fila.id).toBe(data.id)
    expect(fila.customer_user_id).toBe(dueno.id)
  })

  it('descarta las etiquetas fuera del catálogo', async () => {
    const id = await pedido()
    const res = await calificar(id, { rating: 5, tags: ['todo_bien', 'inventada', 'buen_trato'] })
    expect(res.status).toBe(200)
    const { data } = await db
      .from('order_reviews')
      .select('tags')
      .eq('order_id', id)
      .single()
      .throwOnError()
    expect([...data.tags].sort()).toEqual(['buen_trato', 'todo_bien'])
  })

  it('recorta el comentario de 450 caracteres a 400', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 3, comment: 'a'.repeat(450) })).status).toBe(200)
    const { data } = await db
      .from('order_reviews')
      .select('comment')
      .eq('order_id', id)
      .single()
      .throwOnError()
    expect(data.comment).toBe('a'.repeat(400))
  })

  it('recorta los espacios alrededor del comentario', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 3, comment: '   muy rico   ' })).status).toBe(200)
    const { data } = await db
      .from('order_reviews')
      .select('comment')
      .eq('order_id', id)
      .single()
      .throwOnError()
    expect(data.comment).toBe('muy rico')
  })

  it('deja order.reviewed en el registro con hasComment y sin el texto', async () => {
    const id = await pedido()
    const texto = 'comentario-secreto-xyz'
    expect((await calificar(id, { rating: 2, comment: texto })).status).toBe(200)
    const { data } = await db
      .from('order_event_log')
      .select('data')
      .eq('order_id', id)
      .eq('event_type', 'order.reviewed')
      .throwOnError()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.data).toMatchObject({ rating: 2, hasComment: true })
    expect(JSON.stringify(data?.[0]?.data)).not.toContain(texto)
  })

  it('el segundo envío: 409 «Este pedido ya fue calificado»', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 5 })).status).toBe(200)
    const res = await calificar(id, { rating: 1 })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Problema
    expect(body.code).toBe('conflict')
    expect(body.detail).toBe('Este pedido ya fue calificado')
  })

  it('un pedido ajeno y uno inventado: 404 con el mismo cuerpo', async () => {
    const id = await pedido({ de: ajeno })
    const ajenoBody = await errorSinIds(await calificar(id, { rating: 5 }), 404)
    const inventadoBody = await errorSinIds(
      await calificar(crypto.randomUUID(), { rating: 5 }),
      404,
    )
    expect(ajenoBody).toEqual(inventadoBody)
    const { count } = await db
      .from('order_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(0)
  })

  it('un pedido no entregado: 409', async () => {
    const id = await pedido({ entregadoHace: null })
    const res = await calificar(id, { rating: 5 })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Problema).detail).toBe(
      'Solo se puede calificar un pedido entregado',
    )
  })

  it('un pedido fuera de plazo: 409', async () => {
    const id = await pedido({ entregadoHace: 22 })
    const res = await calificar(id, { rating: 5 })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Problema).detail).toBe(
      'El plazo para calificar este pedido ya venció',
    )
  })

  it('la nota 0, 6 o 2.5: 422', async () => {
    const id = await pedido()
    for (const rating of [0, 6, 2.5]) {
      expect((await calificar(id, { rating })).status).toBe(422)
    }
    const { count } = await db
      .from('order_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(0)
  })

  it('el id de una Entrega: 404', async () => {
    await patchCourierSettings({ enabled: true, ignoreSchedule: true })
    const created = await callCreateCourierOrder({
      customerUserId: dueno.id,
      requesterPhone: await phoneOf(dueno),
    })
    if (created.error) throw new Error(`crear la Entrega falló: ${created.error.message}`)
    const courierId = (created.data as { id: string }).id
    await db
      .from('courier_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', courierId)
      .throwOnError()
    expect((await calificar(courierId, { rating: 5 })).status).toBe(404)
  })

  it('sin sesión: 401', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 5 }, null)).status).toBe(401)
  })

  it('una sesión sin el rol de cliente: 403', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 5 }, sinRol.token)).status).toBe(403)
  })
})

describe('POST /customer/orders/{id}/review/dismiss', () => {
  it('descarta un pedido propio: 204 sin cuerpo', async () => {
    const id = await pedido()
    const res = await descartar(id)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    const { count } = await db
      .from('order_review_dismissals')
      .select('order_id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(1)
  })

  it('repetirlo también da 204', async () => {
    const id = await pedido()
    expect((await descartar(id)).status).toBe(204)
    expect((await descartar(id)).status).toBe(204)
  })

  it('tras descartar, el pendiente ya no devuelve ese pedido', async () => {
    const id = await pedido()
    expect((await leerPendiente())?.orderId).toBe(id)
    expect((await descartar(id)).status).toBe(204)
    expect(await leerPendiente()).toBeNull()
  })

  it('después de descartar aún se puede calificar', async () => {
    const id = await pedido()
    expect((await descartar(id)).status).toBe(204)
    expect((await calificar(id, { rating: 4 })).status).toBe(200)
  })

  it('un pedido ajeno y uno inventado: 404 con el mismo cuerpo', async () => {
    const id = await pedido({ de: ajeno })
    const ajenoBody = await errorSinIds(await descartar(id), 404)
    const inventadoBody = await errorSinIds(await descartar(crypto.randomUUID()), 404)
    expect(ajenoBody).toEqual(inventadoBody)
    const { count } = await db
      .from('order_review_dismissals')
      .select('order_id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(0)
  })

  it('sin sesión: 401', async () => {
    const id = await pedido()
    expect((await descartar(id, null)).status).toBe(401)
  })

  it('una sesión sin el rol de cliente: 403', async () => {
    const id = await pedido()
    expect((await descartar(id, sinRol.token)).status).toBe(403)
  })
})

describe('la web sigue igual', () => {
  it('create_order_review sobre un pedido ya calificado: «Este pedido ya fue calificado»', async () => {
    const id = await pedido()
    expect((await calificar(id, { rating: 5 })).status).toBe(200)
    const client = await usuario(dueno)
    const { error } = await client.rpc('create_order_review', {
      p_order_id: id,
      p_rating: 4,
      p_tags: [],
    })
    expect(error?.message).toBe('Este pedido ya fue calificado')
  })

  it('create_order_review sobre un pedido inventado: «Pedido no encontrado» con P0002', async () => {
    const client = await usuario(dueno)
    const { error } = await client.rpc('create_order_review', {
      p_order_id: crypto.randomUUID(),
      p_rating: 4,
      p_tags: [],
    })
    expect(error?.message).toBe('Pedido no encontrado')
    expect(error?.code).toBe('P0002')
  })

  it('get_pending_review devuelve el mismo pedido que la ruta REST', async () => {
    const id = await pedido()
    const client = await usuario(dueno)
    const { data, error } = await client.rpc('get_pending_review')
    expect(error).toBeNull()
    expect((data as { orderId: string } | null)?.orderId).toBe(id)
    expect((await leerPendiente())?.orderId).toBe(id)
  })
})

describe('las funciones *_for no se llaman con la sesión de un usuario', () => {
  it('review_pending_for: permiso denegado', async () => {
    await pedido()
    const client = await usuario(dueno)
    const { error } = await client.rpc('review_pending_for', { p_actor_user_id: dueno.id })
    expect(error?.code).toBe('42501')
  })

  it('create_order_review_for: permiso denegado y no escribe nada', async () => {
    const id = await pedido()
    const client = await usuario(dueno)
    const { error } = await client.rpc('create_order_review_for', {
      p_actor_user_id: dueno.id,
      p_order_id: id,
      p_rating: 5,
      p_tags: [],
    })
    expect(error?.code).toBe('42501')
    const { count } = await db
      .from('order_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(0)
  })

  it('dismiss_order_review_for: permiso denegado y no escribe nada', async () => {
    const id = await pedido()
    const client = await usuario(dueno)
    const { error } = await client.rpc('dismiss_order_review_for', {
      p_actor_user_id: dueno.id,
      p_order_id: id,
    })
    expect(error?.code).toBe('42501')
    const { count } = await db
      .from('order_review_dismissals')
      .select('order_id', { count: 'exact', head: true })
      .eq('order_id', id)
      .throwOnError()
    expect(count).toBe(0)
  })
})
