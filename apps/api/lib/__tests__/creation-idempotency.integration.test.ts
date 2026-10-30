/**
 * Idempotencia de la CREACIÓN de pedidos (restaurantes y Entregas), migraciones
 * 0250-0252. Hallazgos H-3 y H-4 de `Docs/planes/movil/contrato-rest.md` §2; paso
 * 0(c) de §3.
 *
 * EL DEFECTO QUE ESTO CIERRA. La clave se reservaba en `idempotency_keys` en una
 * transacción, el pedido se creaba en OTRA, y la respuesta se guardaba en una
 * TERCERA. Si el proceso caía entre medias:
 *   · antes de la purga de 24 h, el reintento recibía 409 «en proceso» para
 *     siempre aunque el pedido ya existiera;
 *   · después de la purga, el mismo reintento creaba OTRO pedido.
 * Y la tabla tenía PK `(key, scope)`, sin usuario: la clave de A reproducía la
 * respuesta a B (H-4).
 *
 * LA FORMA DEL ARREGLO. La clave vive en `creation_idempotency` con PK
 * `(user_id, scope, key)` y se escribe DENTRO de `create_order_idempotently`, en
 * la misma transacción que el pedido: o están los dos o no está ninguno.
 *
 * Cubre: restaurantes (`create_order`, por RPC) y Entregas (`create_courier_order`,
 * por RPC y por la ruta HTTP real). Las rutas de restaurantes dependen del
 * horario y de la apertura del día, así que ahí se prueba la RPC y los helpers
 * que la ruta usa. El canal manual de la cajera NO usa esta idempotencia.
 */
import { createClient } from '@supabase/supabase-js'
import { CreateCourierOrderRequestSchema } from '@tindivo/contracts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { POST as postCourierOrder } from '../../app/api/v1/customer/courier-orders/route'
import { POST as postOrder } from '../../app/api/v1/customer/orders/route'
import { sha256Hex } from '../http/hash'
import { createIdempotently, findStoredCreation, withIdempotency } from '../http/idempotency'
import { localClient as db } from './helpers/local-db'
import {
  COURIER_POINT_A,
  COURIER_POINT_B,
  callCreateCourierOrder,
  cleanupCourier,
  seedCourierCustomer,
  setCourierEnabled,
  setCourierIgnoreSchedule,
  setCourierMaxActivePerPhone,
} from './helpers/local-db-courier'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const CLAVE = 'test-password-12345'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

interface Cliente {
  id: string
  tel9: string
  token: string
}

const clientes: Cliente[] = []
const pedidos: string[] = []
const courierCustomerIds: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

/** Un cliente de restaurantes con teléfono verificado, sin historial. */
async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const email = `idem-${tel9}@integration.local`
  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Idempotencia' },
  })
  if (error) throw new Error(`no se pudo crear el auth user: ${error.message}`)
  const { error: perr } = await db.from('customer_profiles').insert({
    user_id: auth.user.id,
    full_name: 'Vecino Idempotencia',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (perr) throw new Error(`no se pudo crear el perfil: ${perr.message}`)
  const c = { id: auth.user.id, tel9, token: '' }
  clientes.push(c)
  return c
}

/** Los argumentos de `create_customer_order` para un recojo prepagado. */
function argsPedido(c: Cliente, extra: Record<string, unknown> = {}) {
  return {
    p_customer_user_id: c.id,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'pickup',
    p_payment_intent: 'prepaid',
    p_customer_name: 'Vecino',
    p_customer_phone: c.tel9,
    p_delivery_address: '',
    p_delivery_reference: '',
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_pickup_timing: 'now',
    ...extra,
  }
}

async function borrarPedido(id: string) {
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('order_event_log').delete().eq('order_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('business_charges').delete().eq('order_id', id)
  await db.from('customer_strikes').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
}

async function contarPedidos(userId: string): Promise<number> {
  const { count, error } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_user_id', userId)
  expect(error, error?.message).toBeNull()
  return count ?? 0
}

async function filasDeClave(userId: string, key: string) {
  const { data, error } = await db
    .from('creation_idempotency')
    .select('*')
    .eq('user_id', userId)
    .eq('key', key)
  expect(error, error?.message).toBeNull()
  return data ?? []
}

let courierAntes: Record<string, unknown> | null = null

beforeAll(async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  courierAntes = (data?.value as Record<string, unknown>) ?? null
})

afterEach(async () => {
  for (const id of pedidos.splice(0)) await borrarPedido(id)
})

afterAll(async () => {
  for (const c of clientes.splice(0)) {
    await db.from('creation_idempotency').delete().eq('user_id', c.id)
    await db.from('idempotency_keys').delete().eq('user_id', c.id)
    await db.from('customer_profiles').delete().eq('user_id', c.id)
    await db.from('user_roles').delete().eq('user_id', c.id)
    await db.from('users').delete().eq('id', c.id)
    await db.auth.admin.deleteUser(c.id)
  }
  await db.from('creation_idempotency').delete().in('user_id', courierCustomerIds)
  await db.from('idempotency_keys').delete().in('user_id', courierCustomerIds)
  await db.from('user_roles').delete().in('user_id', courierCustomerIds)
  await cleanupCourier({ customerUserIds: courierCustomerIds.splice(0) })
  if (courierAntes) {
    await db.from('app_settings').update({ value: courierAntes }).eq('key', 'courier')
  }
})

// ── Restaurantes ───────────────────────────────────────────────────────────

describe('restaurantes: la clave vive con el pedido', () => {
  it('crea el pedido y deja la clave en la MISMA transacción, ligada a él', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()

    const r = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(c),
    })

    expect(r.error, r.error?.message).toBeNull()
    expect(r.data?.replayed).toBe(false)
    const creado = r.data?.data as { id: string; status: string }
    pedidos.push(creado.id)

    const filas = await filasDeClave(c.id, key)
    expect(filas).toHaveLength(1)
    expect(filas[0]?.resource_id).toBe(creado.id)
    expect(filas[0]?.response).toMatchObject({ id: creado.id })
  })

  it('el reintento con la misma clave devuelve el pedido original y NO crea otro', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const args = argsPedido(c)

    const a = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args,
    })
    const original = a.data?.data as { id: string }
    pedidos.push(original.id)

    const b = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args,
    })

    expect(b.error, b.error?.message).toBeNull()
    expect(b.data?.replayed).toBe(true)
    expect((b.data?.data as { id: string }).id).toBe(original.id)
    expect(await contarPedidos(c.id)).toBe(1)
  })

  it('la misma clave con OTRO payload se rechaza como conflicto de idempotencia', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const a = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(c),
    })
    pedidos.push((a.data?.data as { id: string }).id)

    const b = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-OTRO',
      args: argsPedido(c),
    })

    expect(b.error?.code).toBe('IK409')
    expect(await contarPedidos(c.id)).toBe(1)
  })

  it('H-4: la clave de A no reproduce nada a B; B crea su propio pedido', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const key = crypto.randomUUID()

    const ra = await createIdempotently(db, {
      userId: a.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(a),
    })
    const pedidoA = (ra.data?.data as { id: string }).id
    pedidos.push(pedidoA)

    // B ni siquiera ve la respuesta de A…
    expect(
      await findStoredCreation(db, {
        userId: b.id,
        scope: 'create_order',
        key,
        requestHash: 'hash-a',
      }),
    ).toBeNull()

    // …y con la misma clave crea lo suyo, sin tocar el pedido de A.
    const rb = await createIdempotently(db, {
      userId: b.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(b),
    })
    expect(rb.error, rb.error?.message).toBeNull()
    expect(rb.data?.replayed).toBe(false)
    const pedidoB = (rb.data?.data as { id: string }).id
    pedidos.push(pedidoB)
    expect(pedidoB).not.toBe(pedidoA)
  })

  it('un llamador no puede crear un pedido a nombre de otro usuario', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const r = await createIdempotently(db, {
      userId: a.id,
      scope: 'create_order',
      key: crypto.randomUUID(),
      requestHash: 'h',
      // La clave es de A pero el pedido apunta a B.
      args: argsPedido(b),
    })
    expect(r.error).not.toBeNull()
    expect(await contarPedidos(b.id)).toBe(0)
  })

  it('cinco peticiones simultáneas con la misma clave crean UN pedido', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const rs = await Promise.all(
      Array.from({ length: 5 }, () =>
        createIdempotently(db, {
          userId: c.id,
          scope: 'create_order',
          key,
          requestHash: 'hash-a',
          args: argsPedido(c),
        }),
      ),
    )
    // TODAS recuperan el mismo pedido: ninguna error, ninguna se queda sin respuesta.
    expect(rs.map((r) => r.error?.message ?? null)).toEqual([null, null, null, null, null])
    const ids = new Set(rs.map((r) => (r.data?.data as { id: string }).id))
    expect(ids.size).toBe(1)
    for (const id of ids) pedidos.push(id)
    expect(await contarPedidos(c.id)).toBe(1)
    expect(rs.filter((r) => r.data?.replayed === false)).toHaveLength(1)
  })

  it('un fallo de la RPC no deja la clave reservada: el reintento puede crear', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    // Negocio inexistente: la RPC levanta y TODO (clave incluida) se revierte.
    const mala = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(c, { p_business_id: crypto.randomUUID() }),
    })
    expect(mala.error).not.toBeNull()
    expect(await filasDeClave(c.id, key)).toHaveLength(0)

    const buena = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'hash-a',
      args: argsPedido(c),
    })
    expect(buena.error, buena.error?.message).toBeNull()
    pedidos.push((buena.data?.data as { id: string }).id)
    expect(buena.data?.replayed).toBe(false)
  })
})

describe('restaurantes: fallo tras el commit y carrera con la purga', () => {
  it('respuesta perdida: el cliente reintenta y recupera el pedido ya confirmado', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const args = argsPedido(c)
    // Commit hecho, respuesta descartada (el proceso murió antes de contestar).
    const perdida = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'h',
      args,
    })
    const id = (perdida.data?.data as { id: string }).id
    pedidos.push(id)

    const r = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'h',
      args,
    })
    expect(r.error, r.error?.message).toBeNull()
    expect(r.data?.replayed).toBe(true)
    expect((r.data?.data as { id: string }).id).toBe(id)
    expect(await contarPedidos(c.id)).toBe(1)
  })

  /** Una clave de la tabla NUEVA ya vencida pero que la purga aún no borró. */
  async function sembrarVencida(c: Cliente, key: string) {
    const { error } = await db.from('creation_idempotency').insert({
      user_id: c.id,
      scope: 'create_order',
      key,
      request_hash: 'h',
      response: {},
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(error, error?.message).toBeNull()
  }

  it('una clave vencida y sin purgar no se reproduce (su respuesta es {}): crea de nuevo', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    await sembrarVencida(c, key)

    const r = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'h',
      args: argsPedido(c),
    })
    expect(r.error, r.error?.message).toBeNull()
    expect(r.data?.replayed).toBe(false)
    const creado = r.data?.data as { id: string }
    expect(creado.id).toBeTruthy()
    pedidos.push(creado.id)
  })

  it('carrera con la purga: la purga borra la clave vencida mientras 5 llamadas entran; sin 500 y un solo pedido', async () => {
    // Se repite para barajar distintas intercalaciones entre la purga y los INSERT.
    for (let ronda = 0; ronda < 5; ronda++) {
      const c = await crearCliente()
      const key = crypto.randomUUID()
      await sembrarVencida(c, key)

      const [purga, ...rs] = await Promise.all([
        db.rpc('prune_creation_idempotency'),
        ...Array.from({ length: 5 }, () =>
          createIdempotently(db, {
            userId: c.id,
            scope: 'create_order',
            key,
            requestHash: 'h',
            args: argsPedido(c),
          }),
        ),
      ])
      expect(purga.error, purga.error?.message).toBeNull()
      expect(rs.map((r) => r.error?.message ?? null)).toEqual([null, null, null, null, null])
      const ids = new Set(rs.map((r) => (r.data?.data as { id: string }).id))
      expect(ids.size).toBe(1)
      for (const id of ids) pedidos.push(id)
      expect(await contarPedidos(c.id)).toBe(1)
      expect(rs.filter((r) => r.data?.replayed === false)).toHaveLength(1)
    }
  })
})

describe('restaurantes por HTTP: el replay va antes de los guards', () => {
  it('tras pausar el negocio, el reintento de un pedido ya creado devuelve el 201 original', async () => {
    const c = await crearCliente()
    await db.from('user_roles').insert({ user_id: c.id, role: 'customer' })
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: ses, error: lerr } = await anon.auth.signInWithPassword({
      email: `idem-${c.tel9}@integration.local`,
      password: CLAVE,
    })
    expect(lerr, lerr?.message).toBeNull()
    c.token = ses.session?.access_token ?? ''

    const key = crypto.randomUUID()
    const cuerpo = {
      businessId: BUSINESS_ID,
      deliveryMethod: 'pickup',
      paymentIntent: 'prepaid',
      pickupTiming: 'now',
      customerName: 'Vecino',
      customerPhone: c.tel9,
      items: [{ menuItemId: ITEM_POLLO_ID, quantity: 1 }],
    }
    const pedir = () =>
      postOrder(
        new Request(`${LOCAL_URL}/api/v1/customer/orders`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${c.token}`,
            'idempotency-key': key,
          },
          body: JSON.stringify(cuerpo),
        }),
      )

    const r1 = await pedir()
    expect(r1.status, await r1.clone().text()).toBe(201)
    const id = ((await r1.json()) as { data: { id: string } }).data.id
    pedidos.push(id)

    // Cambia un guard: el negocio se pausa. Un pedido NUEVO ahora daría 403,
    // pero el reintento de uno ya creado debe ver su 201 original.
    const { data: antes } = await db
      .from('businesses')
      .select('accepting_orders_until')
      .eq('id', BUSINESS_ID)
      .single()
    await db
      .from('businesses')
      .update({ accepting_orders_until: new Date(Date.now() + 3_600_000).toISOString() })
      .eq('id', BUSINESS_ID)
    try {
      const r2 = await pedir()
      expect(r2.status).toBe(201)
      expect(r2.headers.get('idempotency-replayed')).toBe('true')
      expect(((await r2.json()) as { data: { id: string } }).data.id).toBe(id)

      // Y una clave NUEVA sí choca con el guard de pausa: el guard sigue vivo.
      const r3 = await postOrder(
        new Request(`${LOCAL_URL}/api/v1/customer/orders`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${c.token}`,
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify(cuerpo),
        }),
      )
      expect(r3.status).toBe(403)
    } finally {
      await db
        .from('businesses')
        .update({ accepting_orders_until: antes?.accepting_orders_until ?? null })
        .eq('id', BUSINESS_ID)
    }
    expect(await contarPedidos(c.id)).toBe(1)
  })
})

// ── Retención y purga ──────────────────────────────────────────────────────

describe('retención: la purga no reabre una creación reciente', () => {
  it('las claves duran más de 24 h (la ventana en que un reintento puede llegar)', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const r = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'h',
      args: argsPedido(c),
    })
    pedidos.push((r.data?.data as { id: string }).id)
    const [fila] = await filasDeClave(c.id, key)
    const horas = (Date.parse(fila?.expires_at) - Date.parse(fila?.created_at)) / 3_600_000
    expect(horas).toBeGreaterThanOrEqual(24 * 7 - 1)
  })

  it('prune_creation_idempotency borra solo lo vencido y conserva lo vivo', async () => {
    const c = await crearCliente()
    const viva = crypto.randomUUID()
    const vencida = crypto.randomUUID()
    const base = { user_id: c.id, scope: 'create_order', request_hash: 'h', response: {} }
    // `expires_at` explícito en las dos: un insert en lote rellena con NULL, no con el default.
    const { error: insErr } = await db.from('creation_idempotency').insert([
      { ...base, key: viva, expires_at: new Date(Date.now() + 86_400_000).toISOString() },
      { ...base, key: vencida, expires_at: new Date(Date.now() - 60_000).toISOString() },
    ])
    expect(insErr, insErr?.message).toBeNull()

    const { error } = await db.rpc('prune_creation_idempotency')
    expect(error, error?.message).toBeNull()

    expect(await filasDeClave(c.id, viva)).toHaveLength(1)
    expect(await filasDeClave(c.id, vencida)).toHaveLength(0)
  })
})

// ── Permisos ───────────────────────────────────────────────────────────────

describe('permisos: ni anon ni authenticated tocan la idempotencia', () => {
  it.each([
    'anon',
    'authenticated',
  ] as const)('%s no puede ejecutar la RPC ni la purga', async (rol) => {
    const cliente = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (rol === 'authenticated') {
      const c = await crearCliente()
      const { error } = await cliente.auth.signInWithPassword({
        email: `idem-${c.tel9}@integration.local`,
        password: CLAVE,
      })
      expect(error).toBeNull()
    }
    const crear = await cliente.rpc('create_order_idempotently', {
      p_user_id: crypto.randomUUID(),
      p_scope: 'create_order',
      p_key: crypto.randomUUID(),
      p_request_hash: 'h',
      p_args: {},
    })
    expect(crear.error?.code).toBe('42501')
    const purga = await cliente.rpc('prune_creation_idempotency')
    expect(purga.error?.code).toBe('42501')
  })

  it('la tabla no se lee con una sesión de cliente', async () => {
    const cliente = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await cliente.from('creation_idempotency').select('key')
    expect(data ?? []).toHaveLength(0)
  })
})

// ── Entregas ───────────────────────────────────────────────────────────────

describe('Entregas: por la ruta HTTP real', () => {
  async function clienteEntregas(): Promise<Cliente> {
    const base = await seedCourierCustomer()
    courierCustomerIds.push(base.userId)
    const email = (await db.auth.admin.getUserById(base.userId)).data.user?.email as string
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password: 'test-password-12345',
    })
    if (error || !data.session) throw new Error(`login falló: ${error?.message}`)
    await db.from('user_roles').insert({ user_id: base.userId, role: 'customer' })
    return { id: base.userId, tel9: base.phone, token: data.session.access_token }
  }

  function cuerpoEntrega(c: Cliente, extra: Record<string, unknown> = {}) {
    return {
      requesterName: 'Vecino de prueba',
      requesterPhone: c.tel9,
      origin: {
        contactName: 'Elmer',
        coordinates: COURIER_POINT_A,
        referenceText: 'Frente al parque, prueba',
      },
      destination: {
        contactName: 'Vecino',
        contactPhone: c.tel9,
        coordinates: COURIER_POINT_B,
        referenceText: 'Casa de dos pisos, prueba',
      },
      itemDescription: 'Un paquete de prueba',
      isFragile: false,
      readyInMin: 0,
      payer: 'destination',
      weightConfirmed: true,
      prepaidConfirmed: true,
      ...extra,
    }
  }

  function peticion(c: Cliente, key: string, body: unknown) {
    return new Request(`${LOCAL_URL}/api/v1/customer/courier-orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${c.token}`,
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    })
  }

  async function contarEntregas(userId: string): Promise<number> {
    const { count } = await db
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_user_id', userId)
    return count ?? 0
  }

  beforeAll(async () => {
    await setCourierEnabled(true)
    await setCourierIgnoreSchedule(true)
    await setCourierMaxActivePerPhone(5)
  })

  it('crear y reintentar con la misma clave: un solo pedido, misma respuesta, replayed', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)

    const r1 = await postCourierOrder(peticion(c, key, body))
    expect(r1.status).toBe(201)
    expect(r1.headers.get('idempotency-replayed')).toBe('false')
    const j1 = (await r1.json()) as { data: { id: string } }

    const r2 = await postCourierOrder(peticion(c, key, body))
    expect(r2.status).toBe(201)
    expect(r2.headers.get('idempotency-replayed')).toBe('true')
    const j2 = (await r2.json()) as { data: { id: string } }

    expect(j2.data.id).toBe(j1.data.id)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('H-3: la clave nunca queda «reservada»: o está completa con su pedido, o no está', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const r = await postCourierOrder(peticion(c, key, cuerpoEntrega(c)))
    expect(r.status).toBe(201)

    // La reserva en transacción aparte era lo que se quedaba colgado si el
    // proceso moría. Ahora la tabla vieja solo recibe la fila COMPLETA (para
    // el rollback de despliegue), escrita junto al pedido.
    const { data: vieja } = await db.from('idempotency_keys').select('status').eq('key', key)
    expect((vieja ?? []).map((f) => f.status)).toEqual(['completed'])
    expect(await filasDeClave(c.id, key)).toHaveLength(1)
  })

  it('concurrencia: 5 POST simultáneos con la misma clave crean UNA solicitud y todos la recuperan', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => postCourierOrder(peticion(c, key, body))),
    )
    expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201, 201])
    const js = await Promise.all(rs.map((r) => r.json() as Promise<{ data: { id: string } }>))
    expect(new Set(js.map((j) => j.data.id)).size).toBe(1)
    expect(rs.filter((r) => r.headers.get('idempotency-replayed') === 'false')).toHaveLength(1)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('respuesta perdida: el cliente nunca vio el 201 y reintenta; recupera la misma solicitud', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)
    // El proceso confirmó (commit) y murió antes de responder: nadie lee el cuerpo.
    const perdida = await postCourierOrder(peticion(c, key, body))
    expect(perdida.status).toBe(201)

    const r = await postCourierOrder(peticion(c, key, body))
    expect(r.status).toBe(201)
    expect(r.headers.get('idempotency-replayed')).toBe('true')
    expect(await contarEntregas(c.id)).toBe(1)
  })

  // ── Compatibilidad de despliegue: API vieja ↔ nueva ───────────────────────

  /** Crea una solicitud EXACTAMENTE como lo hacía la API anterior (tabla vieja). */
  async function crearComoApiVieja(c: Cliente, key: string, body: unknown) {
    const requestHash = await sha256Hex(JSON.stringify(CreateCourierOrderRequestSchema.parse(body)))
    const r = await withIdempotency(
      db,
      { key, scope: 'create_courier_order', userId: c.id, requestHash },
      async () => {
        const { data, error } = await callCreateCourierOrder({
          customerUserId: c.id,
          requesterPhone: c.tel9,
        })
        if (error) throw new Error(error.message)
        return { status: 201, body: { data } }
      },
    )
    return { requestHash, id: (r.body as { data: { id: string } }).data.id }
  }

  it('API vieja → nueva: el reintento de una creación vieja la recupera, no la duplica', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)
    const vieja = await crearComoApiVieja(c, key, body)

    const r = await postCourierOrder(peticion(c, key, body))
    expect(r.status).toBe(201)
    expect(r.headers.get('idempotency-replayed')).toBe('true')
    expect(((await r.json()) as { data: { id: string } }).data.id).toBe(vieja.id)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('API vieja → nueva: la clave de OTRO usuario en la tabla vieja no se reproduce', async () => {
    const a = await clienteEntregas()
    const b = await clienteEntregas()
    const key = crypto.randomUUID()
    await crearComoApiVieja(a, key, cuerpoEntrega(a))

    const r = await postCourierOrder(peticion(b, key, cuerpoEntrega(b)))
    // La PK vieja no lleva usuario: la clave de A ocupa (key, scope), pero B no
    // recibe nada de A y crea lo suyo en la tabla nueva.
    expect(r.status).toBe(201)
    expect(r.headers.get('idempotency-replayed')).toBe('false')
    expect(await contarEntregas(b.id)).toBe(1)
  })

  it('API vieja → nueva: toda reserva vieja responde 409, reciente o antigua', async () => {
    const c = await clienteEntregas()
    const body = cuerpoEntrega(c)
    const requestHash = await sha256Hex(JSON.stringify(CreateCourierOrderRequestSchema.parse(body)))
    const reservar = (key: string, hace: number) =>
      db.from('idempotency_keys').insert({
        key,
        scope: 'create_courier_order',
        user_id: c.id,
        request_hash: requestHash,
        status: 'reserved',
        created_at: new Date(Date.now() - hace).toISOString(),
      })

    const enVuelo = crypto.randomUUID()
    expect((await reservar(enVuelo, 5_000)).error).toBeNull()
    const r1 = await postCourierOrder(peticion(c, enVuelo, body))
    expect(r1.status).toBe(409)
    expect(await contarEntregas(c.id)).toBe(0)

    // Una reserva de hace 10 min TAMPOCO se da por abandonada: la antigüedad no
    // prueba que el pedido no se creara (y si se creó y ya terminó, los guards
    // de activos dejarían crear otro). Sin asociación verificable, 409.
    const vieja = crypto.randomUUID()
    expect((await reservar(vieja, 10 * 60_000)).error).toBeNull()
    const r2 = await postCourierOrder(peticion(c, vieja, body))
    expect(r2.status).toBe(409)
    expect(await contarEntregas(c.id)).toBe(0)
  })

  it('rollback: la reserva vieja del mismo usuario y payload se COMPLETA al crear con la nueva', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    await db.from('idempotency_keys').insert({
      key,
      scope: 'create_order',
      user_id: c.id,
      request_hash: 'h',
      status: 'reserved',
    })
    const r = await createIdempotently(db, {
      userId: c.id,
      scope: 'create_order',
      key,
      requestHash: 'h',
      args: argsPedido(c),
    })
    expect(r.error, r.error?.message).toBeNull()
    pedidos.push((r.data?.data as { id: string }).id)
    const { data: fila } = await db
      .from('idempotency_keys')
      .select('status,response_status,response_body')
      .eq('key', key)
      .eq('scope', 'create_order')
      .single()
    expect(fila?.status).toBe('completed')
    expect(fila?.response_status).toBe(201)
    expect(fila?.response_body).toMatchObject({ data: { id: (r.data?.data as { id: string }).id } })

    // Con otro payload NO se toca: sigue reservada.
    const otra = crypto.randomUUID()
    await db.from('idempotency_keys').insert({
      key: otra,
      scope: 'create_order',
      user_id: c.id,
      request_hash: 'OTRO',
      status: 'reserved',
    })
    const c2 = await crearCliente()
    const r2 = await createIdempotently(db, {
      userId: c2.id,
      scope: 'create_order',
      key: otra,
      requestHash: 'h',
      args: argsPedido(c2),
    })
    expect(r2.error, r2.error?.message).toBeNull()
    pedidos.push((r2.data?.data as { id: string }).id)
    const { data: intacta } = await db
      .from('idempotency_keys')
      .select('status,user_id')
      .eq('key', otra)
      .single()
    expect(intacta).toMatchObject({ status: 'reserved', user_id: c.id })
  })

  it('purga COMPLETA (las dos tablas) en carrera con creaciones, ambas filas vencidas: sin bloqueo mutuo ni errores', async () => {
    for (let ronda = 0; ronda < 5; ronda++) {
      const c = await crearCliente()
      const key = crypto.randomUUID()
      const vencida = new Date(Date.now() - 60_000).toISOString()
      expect(
        (
          await db.from('creation_idempotency').insert({
            user_id: c.id,
            scope: 'create_order',
            key,
            request_hash: 'h',
            response: {},
            expires_at: vencida,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await db.from('idempotency_keys').insert({
            key,
            scope: 'create_order',
            user_id: c.id,
            request_hash: 'h',
            status: 'reserved',
            expires_at: vencida,
          })
        ).error,
      ).toBeNull()

      const [p1, p2, ...rs] = await Promise.all([
        db.rpc('prune_creation_idempotency'),
        db.rpc('prune_creation_idempotency'),
        ...Array.from({ length: 4 }, () =>
          createIdempotently(db, {
            userId: c.id,
            scope: 'create_order',
            key,
            requestHash: 'h',
            args: argsPedido(c),
          }),
        ),
      ])
      expect(p1.error, p1.error?.message).toBeNull()
      expect(p2.error, p2.error?.message).toBeNull()
      expect(rs.map((r) => r.error?.message ?? null)).toEqual([null, null, null, null])
      const ids = new Set(rs.map((r) => (r.data?.data as { id: string }).id))
      expect(ids.size).toBe(1)
      for (const id of ids) pedidos.push(id)
      expect(await contarPedidos(c.id)).toBe(1)
    }
  })

  it('rollback nueva → vieja: la API anterior reproduce lo creado por la nueva', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)
    const r1 = await postCourierOrder(peticion(c, key, body))
    const id = ((await r1.json()) as { data: { id: string } }).data.id

    // Esto ES el wrapper anterior: si hubiera que volver atrás el despliegue,
    // un reintento llegaría aquí. El handler no debe ejecutarse.
    const requestHash = await sha256Hex(JSON.stringify(CreateCourierOrderRequestSchema.parse(body)))
    const r = await withIdempotency(
      db,
      { key, scope: 'create_courier_order', userId: c.id, requestHash },
      async () => {
        throw new Error('la API vieja no debía volver a crear')
      },
    )
    expect(r.replayed).toBe(true)
    expect(r.status).toBe(201)
    expect((r.body as { data: { id: string } }).data.id).toBe(id)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('reintento tras purga de la tabla vieja: recupera el pedido sin duplicarlo', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const body = cuerpoEntrega(c)
    const r1 = await postCourierOrder(peticion(c, key, body))
    const j1 = (await r1.json()) as { data: { id: string } }

    // La purga diaria de la tabla vieja ya no puede afectar a esta creación.
    await db
      .from('idempotency_keys')
      .delete()
      .lt('expires_at', new Date(Date.now() + 1e9).toISOString())

    const r2 = await postCourierOrder(peticion(c, key, body))
    expect(r2.status).toBe(201)
    expect(((await r2.json()) as { data: { id: string } }).data.id).toBe(j1.data.id)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('payload distinto con la misma clave: 409 idempotency_conflict, sin segundo pedido', async () => {
    const c = await clienteEntregas()
    const key = crypto.randomUUID()
    const r1 = await postCourierOrder(peticion(c, key, cuerpoEntrega(c)))
    expect(r1.status).toBe(201)

    const r2 = await postCourierOrder(
      peticion(c, key, cuerpoEntrega(c, { itemDescription: 'Otra cosa distinta' })),
    )
    expect(r2.status).toBe(409)
    expect(await contarEntregas(c.id)).toBe(1)
  })

  it('H-4: la clave de A usada por B no devuelve el pedido de A', async () => {
    const a = await clienteEntregas()
    const b = await clienteEntregas()
    const key = crypto.randomUUID()
    const ra = await postCourierOrder(peticion(a, key, cuerpoEntrega(a)))
    const ja = (await ra.json()) as { data: { id: string } }

    const rb = await postCourierOrder(peticion(b, key, cuerpoEntrega(b)))
    expect(rb.status).toBe(201)
    expect(rb.headers.get('idempotency-replayed')).toBe('false')
    const jb = (await rb.json()) as { data: { id: string } }
    expect(jb.data.id).not.toBe(ja.data.id)
    expect(await contarEntregas(a.id)).toBe(1)
    expect(await contarEntregas(b.id)).toBe(1)
  })

  it('una clave que no es UUID se rechaza con 422 antes de tocar la base', async () => {
    const c = await clienteEntregas()
    const r = await postCourierOrder(peticion(c, 'no-es-uuid', cuerpoEntrega(c)))
    expect(r.status).toBe(422)
    expect(await contarEntregas(c.id)).toBe(0)
  })
})

describe('un recojo solo se paga por adelantado (0283), por HTTP', () => {
  it('un recojo en caja es 422 con su mensaje y no deja ningún pedido; el prepago entra', async () => {
    const c = await crearCliente()
    await db.from('user_roles').insert({ user_id: c.id, role: 'customer' })
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: ses, error: lerr } = await anon.auth.signInWithPassword({
      email: `idem-${c.tel9}@integration.local`,
      password: CLAVE,
    })
    expect(lerr, lerr?.message).toBeNull()
    const token = ses.session?.access_token ?? ''

    const cuerpo = (paymentIntent: string, pickupTiming: string) => ({
      businessId: BUSINESS_ID,
      deliveryMethod: 'pickup',
      paymentIntent,
      pickupTiming,
      customerName: 'Vecino',
      customerPhone: c.tel9,
      items: [{ menuItemId: ITEM_POLLO_ID, quantity: 1 }],
    })
    const pedir = (body: unknown) =>
      postOrder(
        new Request(`${LOCAL_URL}/api/v1/customer/orders`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        }),
      )

    for (const timing of ['now', 'later']) {
      const r = await pedir(cuerpo('pending_cash', timing))
      const json = (await r.json()) as { code?: string; detail?: string; errors?: unknown }
      expect(r.status, JSON.stringify(json)).toBe(422)
      expect(json.code).toBe('validation_error')
      expect(JSON.stringify(json)).toContain('Un recojo se paga por adelantado')
    }
    expect(await contarPedidos(c.id)).toBe(0)

    const ok = await pedir(cuerpo('prepaid', 'now'))
    expect(ok.status, await ok.clone().text()).toBe(201)
    pedidos.push(((await ok.json()) as { data: { id: string } }).data.id)
    expect(await contarPedidos(c.id)).toBe(1)
  })

  it('RPC directa: un recojo con p_payment_intent null se rechaza con pickup_requires_prepaid y no deja pedido', async () => {
    const c = await crearCliente()
    const r = await db.rpc('create_customer_order', argsPedido(c, { p_payment_intent: null }))
    expect(r.error?.message).toContain('pickup_requires_prepaid')
    expect(await contarPedidos(c.id)).toBe(0)
  })

  it('la envoltura idempotente rechaza un recojo con intent null u omitido y no consume la clave', async () => {
    const c = await crearCliente()
    const sinIntent = (() => {
      const { p_payment_intent: _omitido, ...resto } = argsPedido(c)
      return resto
    })()
    for (const args of [argsPedido(c, { p_payment_intent: null }), sinIntent]) {
      const key = crypto.randomUUID()
      const r = await db.rpc('create_order_idempotently', {
        p_user_id: c.id,
        p_scope: 'create_order',
        p_key: key,
        p_request_hash: 'hash-a',
        p_args: args,
      })
      expect(r.error?.message).toContain('pickup_requires_prepaid')
      expect(await filasDeClave(c.id, key)).toHaveLength(0)
    }
    expect(await contarPedidos(c.id)).toBe(0)
  })

  it('envoltura con clave fija: el recojo en caja se rechaza y la misma clave con prepago crea el pedido', async () => {
    const c = await crearCliente()
    const key = crypto.randomUUID()
    const llamar = (args: Record<string, unknown>) =>
      db.rpc('create_order_idempotently', {
        p_user_id: c.id,
        p_scope: 'create_order',
        p_key: key,
        p_request_hash: 'hash-a',
        p_args: args,
      })

    const malo = await llamar(argsPedido(c, { p_payment_intent: 'pending_cash' }))
    expect(malo.error?.message).toContain('pickup_requires_prepaid')
    expect(await filasDeClave(c.id, key)).toHaveLength(0)
    expect(await contarPedidos(c.id)).toBe(0)

    const bueno = await llamar(argsPedido(c))
    expect(bueno.error, bueno.error?.message).toBeNull()
    const res = bueno.data as { replayed: boolean; data: { id: string } }
    expect(res.replayed).toBe(false)
    pedidos.push(res.data.id)
    expect(await contarPedidos(c.id)).toBe(1)
    const filas = await filasDeClave(c.id, key)
    expect(filas).toHaveLength(1)
    expect(filas[0]?.resource_id).toBe(res.data.id)
  })

  it('HTTP con la misma Idempotency-Key: el 422 del recojo en caja no deja rastro y el prepago entra con 201', async () => {
    const c = await crearCliente()
    await db.from('user_roles').insert({ user_id: c.id, role: 'customer' })
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: ses, error: lerr } = await anon.auth.signInWithPassword({
      email: `idem-${c.tel9}@integration.local`,
      password: CLAVE,
    })
    expect(lerr, lerr?.message).toBeNull()
    const token = ses.session?.access_token ?? ''
    const key = crypto.randomUUID()
    const pedir = (paymentIntent: string) =>
      postOrder(
        new Request(`${LOCAL_URL}/api/v1/customer/orders`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'idempotency-key': key,
          },
          body: JSON.stringify({
            businessId: BUSINESS_ID,
            deliveryMethod: 'pickup',
            paymentIntent,
            pickupTiming: 'now',
            customerName: 'Vecino',
            customerPhone: c.tel9,
            items: [{ menuItemId: ITEM_POLLO_ID, quantity: 1 }],
          }),
        }),
      )

    // Los eventos de un pedido rechazado no tendrían a qué pedido apuntar: se cuenta
    // la tabla entera antes y después (las pruebas de este archivo van en serie).
    const contarEventos = async () => {
      const { count, error } = await db
        .from('domain_events')
        .select('id', { count: 'exact', head: true })
      expect(error, error?.message).toBeNull()
      return count
    }
    const eventosAntes = await contarEventos()

    const malo = await pedir('pending_cash')
    const jmalo = (await malo.json()) as { code?: string }
    expect(malo.status, JSON.stringify(jmalo)).toBe(422)
    expect(jmalo.code).toBe('validation_error')

    // Sin rastro del rechazo: ni clave, ni pedido, ni eventos, ni reservas de promo.
    expect(await filasDeClave(c.id, key)).toHaveLength(0)
    const { data: suyos, error: eped } = await db
      .from('orders')
      .select('id')
      .eq('customer_user_id', c.id)
    expect(eped, eped?.message).toBeNull()
    expect(suyos).toHaveLength(0)
    expect(await contarEventos()).toBe(eventosAntes)
    const { count: reservas, error: eres } = await db
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('customer_user_id', c.id)
    expect(eres, eres?.message).toBeNull()
    expect(reservas).toBe(0)

    const ok = await pedir('prepaid')
    expect(ok.status, await ok.clone().text()).toBe(201)
    expect(ok.headers.get('idempotency-replayed')).toBe('false')
    pedidos.push(((await ok.json()) as { data: { id: string } }).data.id)
    expect(await contarPedidos(c.id)).toBe(1)
  })
})
