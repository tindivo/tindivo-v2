/**
 * La bandeja de reseñas del admin, atravesando la capa HTTP. (0217 + ruta admin)
 *
 * POR QUÉ EXISTE. `order-reviews.integration.test.ts` prueba que el negocio NO
 * puede leer `comment`. Este prueba la otra mitad, que es la que hace que el
 * comentario sirva de algo: que el admin SÍ lo lee, y que lo lee por el único
 * camino que puede — el cliente de service-role dentro de la ruta.
 *
 * NO ES REDUNDANTE CON AQUEL. El GRANT por columna de la 0217 saca `comment`
 * del rol `authenticated`, y el admin navega como `authenticated`: si alguien
 * "arreglara" esta pantalla leyendo por RLS desde el navegador, el texto
 * desaparecería sin que nada fallara ruidosamente. Aquí se ejerce el `Request`
 * real con un JWT real de admin, que es lo que corre en producción salvo el
 * enrutado.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET } from '../../app/api/v1/admin/reviews/route'
import { localClient as db, E2E } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/** Service-role del stack local del CLI. Pública, igual que la anon. */
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// El handler construye su propio cliente desde el entorno, y vitest no lo trae.
// La service-role es imprescindible aquí y no un detalle de montaje: es
// literalmente lo que hace que `comment` sea legible (0217).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

let adminToken = ''
const pedidos: string[] = []

function shortIdNuevo(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += charset[Math.floor(Math.random() * charset.length)]
  return s
}

/**
 * Pedido + reseña, sin pasar por la RPC.
 *
 * Se inserta la reseña directamente con service-role a propósito: lo que este
 * fichero prueba es la LECTURA del admin, y hacerla depender del camino de
 * escritura del cliente ataría dos cosas que se rompen por separado.
 */
async function sembrarResena(opts: {
  businessId?: string
  rating: number
  comment: string | null
  tags?: string[]
}) {
  const { data: order, error } = await db
    .from('orders')
    .insert({
      business_id: opts.businessId ?? E2E.BUSINESS_ID,
      driver_id: E2E.DRIVER_ID,
      short_id: shortIdNuevo(),
      customer_name: 'Vecino Bandeja',
      customer_phone: '+51999000222',
      order_amount: 30.0,
      delivery_fee: 2.0,
      payment_intent: 'pending_cash',
      status: 'confirmed',
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed orders failed: ${error.message}`)
  pedidos.push(order.id)

  const { error: revErr } = await db.from('order_reviews').insert({
    order_id: order.id,
    business_id: opts.businessId ?? E2E.BUSINESS_ID,
    driver_id: E2E.DRIVER_ID,
    rating: opts.rating,
    tags: opts.tags ?? [],
    comment: opts.comment,
  })
  if (revErr) throw new Error(`seed order_reviews failed: ${revErr.message}`)
  return order.id
}

interface Fila {
  order_id: string
  business_id: string
  rating: number
  comment: string | null
  orders: { short_id: string; customer_phone: string | null } | null
  businesses: { name: string } | null
}

async function pedir(qs = ''): Promise<{ status: number; filas: Fila[] }> {
  const res = await GET(
    new Request(`${LOCAL_URL}/api/v1/admin/reviews${qs}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
  )
  if (res.status !== 200) return { status: res.status, filas: [] }
  const body = (await res.json()) as { data: Fila[] }
  return { status: res.status, filas: body.data }
}

beforeAll(async () => {
  // Cliente aparte: `signInWithPassword` sustituiría la sesión de `localClient`.
  const auth = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({
    email: 'admin@e2e.local',
    password: 'e2e-password-12345',
  })
  if (error) throw new Error(`login admin falló: ${error.message}`)
  adminToken = data.session?.access_token ?? ''
})

afterAll(async () => {
  for (const id of pedidos) {
    await db.from('order_reviews').delete().eq('order_id', id)
    await db.from('orders').delete().eq('id', id)
  }
})

describe('GET /admin/reviews', () => {
  it('devuelve el comentario, que es lo único que solo se ve aquí', async () => {
    const orderId = await sembrarResena({
      rating: 2,
      comment: 'la pizza llegó fría y faltó una gaseosa',
      tags: ['llego_fria', 'falto_algo'],
    })
    const { status, filas } = await pedir()
    expect(status).toBe(200)

    const fila = filas.find((f) => f.order_id === orderId)
    expect(fila?.comment).toBe('la pizza llegó fría y faltó una gaseosa')
  })

  it('trae el pedido, el negocio y el teléfono: el admin sí puede llamar', async () => {
    // Es justo la capacidad que al negocio se le niega. Si esto se pierde, la
    // reseña deja de poder resolverse y solo sirve para mirarla.
    const orderId = await sembrarResena({ rating: 1, comment: 'nunca llegó' })
    const { filas } = await pedir()
    const fila = filas.find((f) => f.order_id === orderId)

    expect(fila?.orders?.short_id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect(fila?.orders?.customer_phone).toBe('+51999000222')
    expect(fila?.businesses?.name).toBeTruthy()
  })

  it('filtra por restaurante', async () => {
    const enUno = await sembrarResena({ rating: 5, comment: 'del negocio 1' })
    const enOtro = await sembrarResena({
      businessId: E2E.BUSINESS_2_ID,
      rating: 5,
      comment: 'del negocio 2',
    })

    const { filas } = await pedir(`?businessId=${E2E.BUSINESS_2_ID}`)
    const ids = filas.map((f) => f.order_id)
    expect(ids).toContain(enOtro)
    expect(ids).not.toContain(enUno)
    expect(filas.every((f) => f.business_id === E2E.BUSINESS_2_ID)).toBe(true)
  })

  it('«solo con comentario» deja fuera las que solo traen nota', async () => {
    const conTexto = await sembrarResena({ rating: 3, comment: 'algo que decir' })
    const sinTexto = await sembrarResena({ rating: 3, comment: null })

    const { filas } = await pedir('?withComment=true')
    const ids = filas.map((f) => f.order_id)
    expect(ids).toContain(conTexto)
    expect(ids).not.toContain(sinTexto)
  })

  it('sin sesión de admin no se entra', async () => {
    const res = await GET(new Request(`${LOCAL_URL}/api/v1/admin/reviews`))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('un token que no es de admin tampoco', async () => {
    // El negocio tiene sesión válida, y sin el `requireRole` esta ruta le
    // entregaría los comentarios de TODOS los restaurantes, no solo los suyos.
    const auth = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await auth.auth.signInWithPassword({
      email: 'negocio@e2e.local',
      password: 'e2e-password-12345',
    })
    const res = await GET(
      new Request(`${LOCAL_URL}/api/v1/admin/reviews`, {
        headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` },
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
