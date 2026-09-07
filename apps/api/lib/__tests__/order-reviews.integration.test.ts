/**
 * El cliente califica su pedido. (Migración 0215)
 *
 * QUÉ AMARRA. `create_order_review` es la única puerta de escritura: no hay
 * policy de INSERT sobre `order_reviews` para nadie salvo admin, así que todo
 * lo que la reseña tiene que garantizar —que el pedido sea tuyo, que esté
 * entregado, que la ventana siga abierta, que sea una por pedido— vive dentro
 * de esa función y solo se puede comprobar aquí, contra la base.
 *
 * LOS CASOS QUE NO SON DE ADORNO:
 *
 *  · PEDIDO AJENO Y PEDIDO INEXISTENTE RESPONDEN IGUAL (P0002). Si el ajeno
 *    devolviera "prohibido" y el inexistente "no existe", cualquiera podría
 *    sondear qué UUIDs son pedidos reales. En un pueblo donde te sabes el
 *    número del vecino, eso es información de más.
 *
 *  · UNA POR PEDIDO. El `unique (order_id)` es la guarda real contra el doble
 *    envío (dos toques seguidos en el botón), y contra el brigading: para
 *    opinar hay que haber pagado y recibido. Si alguien lo quita por
 *    "redundante con la UI", la tabla queda abierta.
 *
 *  · EL DESCARTE CIERRA LA PREGUNTA, NO LA VENTANA. "Ahora no" saca el pedido
 *    de `get_pending_review`, pero el cliente que entra por su cuenta desde el
 *    historial todavía puede calificar. Son dos cosas distintas y es fácil
 *    colapsarlas en una.
 *
 * POR QUÉ CLIENTES PROPIOS Y NO LOS DEL SEED E2E. Igual que en
 * `contraentrega-delivery-history`: estos tests necesitan clientes con un
 * historial de entregas CONTROLADO, y `delivered` es terminal — los del seed
 * acumulan pedidos entregados para siempre en la base local, así que
 * `get_pending_review` empezaría a devolver el pedido de otra suite y los casos
 * darían verde o rojo por el motivo equivocado.
 *
 * LOS RELOJES NO SE SIEMBRAN EN EL INSERT: un trigger los pisa con `now()`. Un
 * pedido "entregado hace 30 días" se construye con un UPDATE posterior, nunca
 * en el INSERT.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db, E2E } from './helpers/local-db'

/** Anon key del stack local del CLI. Pública, igual que en las demás suites. */
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CLAVE = 'test-password-12345'
const NOMBRE_FIXTURE = 'Vecino Reseñas'

const clientesCreados: string[] = []
const pedidosCreados: string[] = []

interface Cliente {
  id: string
  email: string
}

async function crearCliente(): Promise<Cliente> {
  const email = `resenas-${crypto.randomUUID().slice(0, 8)}@integration.local`
  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_FIXTURE },
  })
  if (error) throw new Error(`no se pudo crear el auth user: ${error.message}`)
  clientesCreados.push(auth.user.id)
  return { id: auth.user.id, email }
}

/** Cliente de navegador autenticado: es el que ejerce RLS y el token de la RPC. */
async function comoCliente(cliente: Cliente) {
  const navegador = createClient('http://127.0.0.1:54321', LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await navegador.auth.signInWithPassword({
    email: cliente.email,
    password: CLAVE,
  })
  if (error) throw new Error(`login falló: ${error.message}`)
  return navegador
}

function shortIdNuevo(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += charset[Math.floor(Math.random() * charset.length)]
  return s
}

/**
 * Pedido del cliente en el estado que pida el caso.
 *
 * `delivered_at` se escribe en un UPDATE aparte porque el trigger lo pisa con
 * `now()` en el INSERT: sin ese segundo paso, "entregado hace 30 días" nace
 * entregado hoy y el caso de la ventana vencida da verde por accidente.
 */
async function sembrarPedido(
  clienteId: string,
  opts: { status?: string; diasAtras?: number } = {},
): Promise<string> {
  const { status = 'delivered', diasAtras = 1 } = opts
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: E2E.BUSINESS_ID,
      driver_id: E2E.DRIVER_ID,
      customer_user_id: clienteId,
      short_id: shortIdNuevo(),
      customer_phone: '+51999000222',
      order_amount: 30.0,
      delivery_fee: 2.0,
      payment_intent: 'pending_cash',
      status,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed orders failed: ${error.message}`)
  pedidosCreados.push(data.id)

  if (status === 'delivered') {
    const entregado = new Date(Date.now() - diasAtras * 86_400_000).toISOString()
    const { error: upErr } = await db
      .from('orders')
      .update({ delivered_at: entregado })
      .eq('id', data.id)
    if (upErr) throw new Error(`backdate delivered_at failed: ${upErr.message}`)
  }
  return data.id
}

let cliente: Cliente
let navegador: Awaited<ReturnType<typeof comoCliente>>

beforeAll(async () => {
  cliente = await crearCliente()
  navegador = await comoCliente(cliente)
})

afterAll(async () => {
  // Orden: reseñas y descartes (FK a orders) → pedidos → usuarios.
  // `order_event_log` cae por cascada con el pedido; `order_reviews` también,
  // pero se borra explícito para no depender de ello si la FK cambia.
  for (const id of pedidosCreados) {
    await db.from('order_reviews').delete().eq('order_id', id)
    await db.from('order_review_dismissals').delete().eq('order_id', id)
    await db.from('orders').delete().eq('id', id)
  }
  for (const id of clientesCreados) {
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
})

describe('create_order_review — dejar la reseña', () => {
  it('un pedido entregado del cliente se califica, y queda con su negocio y su motorizado', async () => {
    const orderId = await sembrarPedido(cliente.id)
    const { data, error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 5,
      p_tags: ['todo_bien', 'buen_trato'],
      p_comment: '  Llegó calientita  ',
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ orderId, rating: 5 })

    const { data: fila } = await db
      .from('order_reviews')
      .select('rating, tags, comment, business_id, driver_id, customer_user_id')
      .eq('order_id', orderId)
      .single()

    expect(fila?.rating).toBe(5)
    expect(fila?.tags?.sort()).toEqual(['buen_trato', 'todo_bien'])
    // El comentario se recorta: los espacios de sobra no son parte de la opinión.
    expect(fila?.comment).toBe('Llegó calientita')
    // Snapshot, no derivado: es lo único que dice si fue la cocina o la moto.
    expect(fila?.business_id).toBe(E2E.BUSINESS_ID)
    expect(fila?.driver_id).toBe(E2E.DRIVER_ID)
    expect(fila?.customer_user_id).toBe(cliente.id)
  })

  it('deja rastro en order_event_log sin copiar el texto del comentario', async () => {
    const orderId = await sembrarPedido(cliente.id)
    await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 4,
      p_comment: 'un texto que no debe replicarse',
    })

    const { data: log } = await db
      .from('order_event_log')
      .select('event_type, actor_role, data')
      .eq('order_id', orderId)
      .eq('event_type', 'order.reviewed')
      .single()

    expect(log?.actor_role).toBe('cliente')
    expect(log?.data).toMatchObject({ rating: 4, hasComment: true })
    // El texto vive en un solo sitio. Duplicarlo en el log lo pondría al alcance
    // de cualquier pantalla que muestre la auditoría del pedido.
    expect(JSON.stringify(log?.data)).not.toContain('no debe replicarse')
  })

  it('la nota sola basta: ni etiquetas ni comentario son obligatorios', async () => {
    const orderId = await sembrarPedido(cliente.id)
    const { error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 3,
    })
    expect(error).toBeNull()

    const { data: fila } = await db
      .from('order_reviews')
      .select('tags, comment')
      .eq('order_id', orderId)
      .single()
    expect(fila?.tags).toEqual([])
    expect(fila?.comment).toBeNull()
  })

  it('una etiqueta fuera del catálogo se descarta en vez de tumbar el envío', async () => {
    // El catálogo se edita en vivo desde `app_settings`. Si un id retirado
    // hiciera fallar la RPC, editar el catálogo rompería la app de quien tuviera
    // la tarjeta abierta.
    const orderId = await sembrarPedido(cliente.id)
    const { error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 2,
      p_tags: ['demoro', 'etiqueta_inventada'],
    })
    expect(error).toBeNull()

    const { data: fila } = await db
      .from('order_reviews')
      .select('tags')
      .eq('order_id', orderId)
      .single()
    expect(fila?.tags).toEqual(['demoro'])
  })

  it('el mismo pedido no se califica dos veces', async () => {
    const orderId = await sembrarPedido(cliente.id)
    await navegador.rpc('create_order_review', { p_order_id: orderId, p_rating: 5 })
    const { error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 1,
    })

    expect(error?.code).toBe('P0001')
    expect(error?.message).toContain('ya fue calificado')

    const { count } = await db
      .from('order_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    expect(count).toBe(1)
  })

  it('el pedido de otro cliente responde igual que uno inexistente', async () => {
    const otro = await crearCliente()
    const suyo = await sembrarPedido(otro.id)

    const ajeno = await navegador.rpc('create_order_review', {
      p_order_id: suyo,
      p_rating: 1,
    })
    const inexistente = await navegador.rpc('create_order_review', {
      p_order_id: '00000000-0000-4000-8000-000000000000',
      p_rating: 1,
    })

    // Mismo código y mismo mensaje: no se confirma qué UUIDs son pedidos reales.
    expect(ajeno.error?.code).toBe('P0002')
    expect(inexistente.error?.code).toBe('P0002')
    expect(ajeno.error?.message).toBe(inexistente.error?.message)
  })

  it('un pedido que no llegó a entregarse no se califica', async () => {
    const orderId = await sembrarPedido(cliente.id, { status: 'preparing' })
    const { error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 5,
    })
    expect(error?.code).toBe('P0001')
    expect(error?.message).toContain('entregado')
  })

  it('fuera de la ventana de 21 días el plazo venció', async () => {
    const orderId = await sembrarPedido(cliente.id, { diasAtras: 22 })
    const { error } = await navegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 5,
    })
    expect(error?.code).toBe('P0001')
    // Se afirma sobre el código y una raíz sin tilde a propósito: el mensaje es
    // copy y se va a reescribir; el contrato con el frontend es el errcode.
    expect(error?.message).toContain('plazo')
  })

  it('una nota fuera de 1-5 se rechaza antes de tocar la tabla', async () => {
    const orderId = await sembrarPedido(cliente.id)
    for (const rating of [0, 6]) {
      const { error } = await navegador.rpc('create_order_review', {
        p_order_id: orderId,
        p_rating: rating,
      })
      expect(error?.code).toBe('P0001')
    }
    const { count } = await db
      .from('order_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    expect(count).toBe(0)
  })
})

describe('get_pending_review — por cuál preguntar', () => {
  it('sin pedidos entregados sin calificar, no devuelve nada', async () => {
    const virgen = await crearCliente()
    const suNavegador = await comoCliente(virgen)
    const { data, error } = await suNavegador.rpc('get_pending_review')
    expect(error).toBeNull()
    // NULL, no un objeto vacío: la tarjeta no se pinta si no hay qué preguntar.
    expect(data).toBeNull()
  })

  it('devuelve el más reciente, con el nombre del negocio para la tarjeta', async () => {
    const c = await crearCliente()
    const suNavegador = await comoCliente(c)
    await sembrarPedido(c.id, { diasAtras: 9 })
    const reciente = await sembrarPedido(c.id, { diasAtras: 1 })
    await sembrarPedido(c.id, { diasAtras: 5 })

    const { data } = await suNavegador.rpc('get_pending_review')
    expect(data).toMatchObject({ orderId: reciente })
    // La tarjeta necesita decir de qué pedido habla sin una segunda consulta.
    expect((data as { businessName?: string })?.businessName).toBeTruthy()
    expect((data as { closesAt?: string })?.closesAt).toBeTruthy()
  })

  it('el ya calificado deja de aparecer', async () => {
    const c = await crearCliente()
    const suNavegador = await comoCliente(c)
    const orderId = await sembrarPedido(c.id, { diasAtras: 1 })

    await suNavegador.rpc('create_order_review', { p_order_id: orderId, p_rating: 5 })
    const { data } = await suNavegador.rpc('get_pending_review')
    expect(data).toBeNull()
  })

  it('el caducado no aparece aunque sea el único', async () => {
    const c = await crearCliente()
    const suNavegador = await comoCliente(c)
    await sembrarPedido(c.id, { diasAtras: 30 })
    const { data } = await suNavegador.rpc('get_pending_review')
    expect(data).toBeNull()
  })

  it('descartar cierra la pregunta pero NO la ventana', async () => {
    const c = await crearCliente()
    const suNavegador = await comoCliente(c)
    const orderId = await sembrarPedido(c.id, { diasAtras: 2 })

    // El descarte es dato self-scoped: lo escribe el browser directo por RLS,
    // sin RPC y sin pagar el salto a la API.
    const { error: errDescarte } = await suNavegador
      .from('order_review_dismissals')
      .insert({ order_id: orderId, customer_user_id: c.id })
    expect(errDescarte).toBeNull()

    const { data: pendiente } = await suNavegador.rpc('get_pending_review')
    expect(pendiente).toBeNull()

    // Pero si entra por su cuenta desde el historial, todavía puede calificar.
    const { error } = await suNavegador.rpc('create_order_review', {
      p_order_id: orderId,
      p_rating: 4,
    })
    expect(error).toBeNull()
  })

  it('nadie puede descartar el pedido de otro y apagarle la pregunta', async () => {
    const victima = await crearCliente()
    const orderId = await sembrarPedido(victima.id, { diasAtras: 1 })

    const { error } = await navegador
      .from('order_review_dismissals')
      .insert({ order_id: orderId, customer_user_id: victima.id })
    expect(error).not.toBeNull()

    const suNavegador = await comoCliente(victima)
    const { data } = await suNavegador.rpc('get_pending_review')
    expect(data).toMatchObject({ orderId })
  })
})

describe('RLS — quién ve las reseñas', () => {
  it('el cliente lee la suya y no la de otro', async () => {
    const otro = await crearCliente()
    const suNavegador = await comoCliente(otro)
    const pedidoAjeno = await sembrarPedido(otro.id)
    await suNavegador.rpc('create_order_review', { p_order_id: pedidoAjeno, p_rating: 5 })

    const propio = await sembrarPedido(cliente.id)
    await navegador.rpc('create_order_review', { p_order_id: propio, p_rating: 3 })

    const { data } = await navegador.from('order_reviews').select('order_id')
    const ids = (data ?? []).map((r) => r.order_id)
    expect(ids).toContain(propio)
    expect(ids).not.toContain(pedidoAjeno)
  })

  it('anon no puede llamar a ninguna de las dos RPC', async () => {
    // Un CREATE OR REPLACE no conserva la ACL y los default privileges de
    // Supabase devuelven EXECUTE a PUBLIC en cuanto queda vacía (0123, 0204).
    // Este caso es el que avisa si esa revocación se vuelve a perder.
    const anon = createClient('http://127.0.0.1:54321', LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const crear = await anon.rpc('create_order_review', {
      p_order_id: '00000000-0000-4000-8000-000000000000',
      p_rating: 5,
    })
    const pendiente = await anon.rpc('get_pending_review')
    expect(crear.error).not.toBeNull()
    expect(pendiente.error).not.toBeNull()
  })

  it('anon no lee la tabla de reseñas', async () => {
    // En Fase A no hay lectura pública. El día que la haya será una policy
    // nueva y explícita, no un descuido de grants.
    const anon = createClient('http://127.0.0.1:54321', LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.from('order_reviews').select('id')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
})
